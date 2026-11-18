// QR2.3 (mail-path effect bound)

import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(here, '..', '..')

// Miniflare ships as a transitive dependency of wrangler in worker/node_modules.
const requireFromWorker = createRequire(join(repositoryRoot, 'worker', 'package.json'))
const { Miniflare } = requireFromWorker('miniflare')

const iterations = Number(process.env.POSTERN_TTE_ITERATIONS ?? 200)
const pollIntervalMs = Number(process.env.POSTERN_TTE_POLL_MS ?? 50)
const timeoutMs = Number(process.env.POSTERN_TTE_TIMEOUT_MS ?? 60_000)
const runId = process.env.RUN_ID ?? `tte-${Date.now()}`
const output = resolve(process.env.POSTERN_TTE_OUT ?? join(here, 'generated', 'time-to-effect.json'))

if (!Number.isInteger(iterations) || iterations < 1) throw new Error('POSTERN_TTE_ITERATIONS must be a positive integer')

// A stand-in for the Worker mail path: publish on the write path, read with the
// same cacheTtl shape the real mail decision path uses.
const workerScript = `
  const json = (value, status = 200) =>
    new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })

  export default {
    async fetch(request, env) {
      const url = new URL(request.url)
      if (url.pathname === '/publish' && request.method === 'POST') {
        const body = await request.json()
        await env.POSTERN_KV.put(body.key, JSON.stringify(body.value))
        return json({ ok: true })
      }
      if (url.pathname === '/effect' && request.method === 'GET') {
        const key = url.searchParams.get('key')
        const value = await env.POSTERN_KV.get(key, { type: 'json', cacheTtl: 60 })
        return json({ value })
      }
      return json({ error: 'not_found' }, 404)
    }
  }
`

function percentile(sorted, p) {
  if (sorted.length === 0) return null
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[index]
}

// The 60 s bound is only real if the production Worker actually caps its
// mail-path KV reads at 60 s. Verify the four documented reads in source.
function verifyTtlContract() {
  const source = readFileSync(join(repositoryRoot, 'worker', 'src', 'index.ts'), 'utf8')
  const reads = (source.match(/cacheTtl:\s*60/g) ?? []).length
  if (reads < 4) {
    throw new Error(`Expected >= 4 cacheTtl:60 mail-path reads in worker/src/index.ts, found ${reads}`)
  }
  return reads
}

const ttlReads = verifyTtlContract()
const mf = new Miniflare({
  modules: true,
  script: workerScript,
  kvNamespaces: ['POSTERN_KV']
})

async function call(path, init) {
  const response = await mf.dispatchFetch(`http://localhost${path}`, init)
  if (!response.ok) throw new Error(`${path} returned ${response.status}`)
  return response.json()
}

const latencies = []
let timeouts = 0
let polls = 0

try {
  console.log(`Running ${iterations} publish-then-poll cycles against Miniflare KV (run ${runId})`)
  for (let cycle = 1; cycle <= iterations; cycle += 1) {
    const key = `alias:tte:${runId}:${cycle}`
    const token = `value-${runId}-${cycle}`
    const started = performance.now()

    await call('/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, value: { token, status: 'active' } })
    })

    const deadline = performance.now() + timeoutMs
    let observedAt = null
    while (performance.now() < deadline) {
      polls += 1
      const result = await call(`/effect?key=${encodeURIComponent(key)}`)
      if (result.value?.token === token) {
        observedAt = performance.now()
        break
      }
      await new Promise((resolveDelay) => setTimeout(resolveDelay, pollIntervalMs))
    }

    if (observedAt === null) {
      timeouts += 1
      console.warn(`  cycle ${cycle}: timed out after ${timeoutMs} ms`)
    } else {
      latencies.push(observedAt - started)
    }
  }
} finally {
  await mf.dispose()
}

latencies.sort((a, b) => a - b)
const summary = {
  p50Ms: percentile(latencies, 50),
  p95Ms: percentile(latencies, 95),
  p99Ms: percentile(latencies, 99),
  maxMs: latencies.length > 0 ? latencies[latencies.length - 1] : null
}
const passed = timeouts === 0 && summary.p95Ms !== null && summary.p95Ms <= 60_000

const evidence = {
  requirement: 'QR2.3',
  requirement_text: 'Core-task steps p95 ≤ 2 s; task p95 ≤ 5 s; effect in mail path p95 ≤ 60 s',
  scope: 'mail-path time-to-effect (60 s bound) via publish-then-poll against Miniflare KV',
  record_type: 'time-to-effect harness result',
  recorded_at: new Date().toISOString().slice(0, 10),
  status: passed ? 'PASS' : 'FAIL',
  harness: {
    script: 'load/scripts/time-to-effect.mjs',
    miniflare: requireFromWorker('miniflare/package.json').version,
    iterations,
    poll_interval_ms: pollIntervalMs,
    timeout_ms: timeoutMs,
    run_id: runId,
    publish: 'POST /publish -> POSTERN_KV.put',
    mail_decision_read: "GET /effect -> POSTERN_KV.get(key, { type: 'json', cacheTtl: 60 })"
  },
  worker_ttl_contract: {
    source: 'worker/src/index.ts',
    cacheTtl_60_reads_found: ttlReads,
    expected_minimum: 4,
    note: 'alias record plus __global_blocklist, suspended_users and rate_limited_users; this TTL is what bounds production staleness to 60 s'
  },
  measured: {
    successful_cycles: latencies.length,
    timeouts,
    total_polls: polls,
    ...Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, value === null ? null : Math.round(value * 1000) / 1000])),
    threshold_p95_ms: 60_000
  },
  caveats: [
    'Miniflare 3 does not emulate Cloudflare KV cacheTtl staleness; the measured publish-to-observe values are the propagation floor, not the worst-case cached read.',
    'The 60 s production bound is enforced by the cacheTtl:60 reads in worker/src/index.ts (verified above), not measured through an emulated edge cache.',
    'This harness covers only the mail-path effect leg of QR2.3. The 2 s step and 5 s task targets belong to instrumented Playwright journeys and are not measured here.'
  ]
}

mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n')
console.log(JSON.stringify(evidence.measured, null, 2))
console.log(`Evidence: ${output}`)
if (!passed) process.exit(1)
