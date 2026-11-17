/**
 * Node-side canary, NOT the QR2.4 evidence.
 *
 * This harness times the Worker module against fakes in Node, so it measures V8
 * event-loop time, Vitest frames and promise scheduling that do not exist in
 * workerd, and it counts CPU the way process.cpuUsage() does rather than the way
 * Cloudflare bills it. It is useful for spotting a self-inflicted regression in
 * the handler's own work; it cannot prove a per-invocation workerd budget.
 *
 * QR2.4's CPU half is evidenced by Cloudflare's own accounting:
 *   docs/nfr/evidence/QR2.4-2026-11-17.json  (workersInvocationsAdaptive.cpuTimeP99)
 * The reads/writes half is gated deterministically in test/kv-budget.test.ts.
 * Keep this file out of the required gate.
 */
import { writeFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import worker from '../src/index'

type WorkerMessage = Parameters<typeof worker.email>[0]
type WorkerEnv = Parameters<typeof worker.email>[1]
type WorkerContext = Parameters<typeof worker.email>[2]

const AliasAddress = 'cpu@postern.local'
const UserId = '44444444-4444-4444-4444-444444444444'
const Destination = 'cpu-forward@example.test'
const Batches = 20
const MessagesPerBatch = 500
const Iterations = Batches * MessagesPerBatch

function createKv() {
  const records: Record<string, unknown> = {
    [AliasAddress]: {
      destination: Destination,
      status: 'active',
      userId: UserId,
      blockedSenders: [],
    },
    __global_blocklist: { domains: [] },
    suspended_users: { users: {} },
    rate_limited_users: { users: {} },
  }
  const get = vi.fn(async (key: string) =>
    Object.prototype.hasOwnProperty.call(records, key) ? records[key] : null,
  )
  return { namespace: { get } as unknown as KVNamespace, get }
}

function createMessage() {
  const headers = new Map<string, string | null>([
    ['from', 'Shop <orders@shop.example>'],
    ['subject', 'Your order shipped'],
    ['message-id', '<cpu-1@shop.example>'],
    ['authentication-results', 'mx.example; dkim=pass spf=pass'],
  ])

  return {
    to: AliasAddress,
    from: 'orders@shop.example',
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    forward: vi.fn(async () => undefined),
  } as unknown as WorkerMessage
}

function createContext() {
  const context = {
    waitUntil: () => undefined,
  } as unknown as WorkerContext
  return context
}

function createEnv(kv: KVNamespace) {
  return {
    POSTERN_KV: kv,
    INGEST_ENDPOINT: 'https://api.postern.test/api/ingest',
    INGEST_SECRET: 'worker-test-secret',
    API_BASE_URL: 'https://api.postern.test',
    JOB_SECRET: 'worker-test-job-secret',
  } as unknown as WorkerEnv
}

function percentile(sorted: number[], fraction: number): number {
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))
  return sorted[index]
}

describe('Worker CPU budget per message', () => {
  it('records per-message CPU cost', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 202 })))
    const kv = createKv()
    const env = createEnv(kv.namespace)
    const context = createContext()
    const message = createMessage()

    // Warm up so module-level tables and the first-call cost do not dominate
    for (let index = 0; index < 50; index += 1) {
      await worker.email(message, env, context)
    }

    // CPU is sampled over a batch of messages 
    const samples: number[] = []
    const totalBefore = process.cpuUsage()
    const wallStarted = process.hrtime.bigint()
    for (let batch = 0; batch < Batches; batch += 1) {
      const before = process.cpuUsage()
      for (let index = 0; index < MessagesPerBatch; index += 1) {
        await worker.email(message, env, context)
      }
      const after = process.cpuUsage(before)
      samples.push((after.user + after.system) / 1_000 / MessagesPerBatch)
    }
    const totalAfter = process.cpuUsage(totalBefore)
    const wallElapsedMilliseconds = Number(process.hrtime.bigint() - wallStarted) / 1e6
    const totalCpuPerMessage = (totalAfter.user + totalAfter.system) / 1_000 / Iterations
    const wallPerMessage = wallElapsedMilliseconds / Iterations

    expect(kv.get).toHaveBeenCalled()
    expect((message as unknown as { forward: ReturnType<typeof vi.fn> }).forward)
      .toHaveBeenCalledTimes(Iterations + 50)

    samples.sort((left, right) => left - right)
    const median = percentile(samples, 0.5)
    const p95 = percentile(samples, 0.95)
    const mean = samples.reduce((total, value) => total + value, 0) / samples.length

    const measurement = {
      runtime: `node ${process.version}`,
      messages: Iterations,
      cpuMillisecondsPerMessage: {
        median: Number(median.toFixed(3)),
        p95: Number(p95.toFixed(3)),
        mean: Number(mean.toFixed(3)),
      },
      totals: {
        cpuPerMessage: Number(totalCpuPerMessage.toFixed(4)),
        wallPerMessage: Number(wallPerMessage.toFixed(4)),
      },
      kvReadsPerMessage: Number((kv.get.mock.calls.length / (Iterations + 50)).toFixed(3)),
      recordedAt: new Date().toISOString(),
      note: 'Measured in Node, not workerd. A regression canary only: QR2.4 CPU is evidenced by Cloudflare cpuTimeP99 in docs/nfr/evidence/QR2.4-2026-11-17.json.',
    }

    writeFileSync('perf/cpu-measurement.json', `${JSON.stringify(measurement, null, 2)}\n`)
    console.log('Worker CPU measurement:', JSON.stringify(measurement))
  })
})
