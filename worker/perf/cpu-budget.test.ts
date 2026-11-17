
import { writeFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import worker from '../src/index'

type WorkerMessage = Parameters<typeof worker.email>[0]
type WorkerEnv = Parameters<typeof worker.email>[1]
type WorkerContext = Parameters<typeof worker.email>[2]

const AliasAddress = 'cpu@postern.local'
const UserId = '44444444-4444-4444-4444-444444444444'
const Destination = 'cpu-forward@example.test'
const Iterations = 10_000

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

    // CPU is measured over the whole run. Per-batch sampling is not reported: at this
    // message count a batch's CPU often lands below the clock's resolution, so the
    // per-batch quantiles are mostly zeros and say nothing about the handler.
    const totalBefore = process.cpuUsage()
    const wallStarted = process.hrtime.bigint()
    for (let index = 0; index < Iterations; index += 1) {
      await worker.email(message, env, context)
    }
    const totalAfter = process.cpuUsage(totalBefore)
    const wallElapsedMilliseconds = Number(process.hrtime.bigint() - wallStarted) / 1e6
    const totalCpuPerMessage = (totalAfter.user + totalAfter.system) / 1_000 / Iterations
    const wallPerMessage = wallElapsedMilliseconds / Iterations

    expect(kv.get).toHaveBeenCalled()
    expect((message as unknown as { forward: ReturnType<typeof vi.fn> }).forward)
      .toHaveBeenCalledTimes(Iterations + 50)

    const measurement = {
      runtime: `node ${process.version}`,
      messages: Iterations,
      totals: {
        cpuPerMessage: Number(totalCpuPerMessage.toFixed(4)),
        wallPerMessage: Number(wallPerMessage.toFixed(4)),
      },
      kvReadsPerMessage: Number((kv.get.mock.calls.length / (Iterations + 50)).toFixed(3)),
      recordedAt: new Date().toISOString(),
      note: 'Node regression canary, not workerd. Totals only: per-batch quantiles at this size are below the CPU clock resolution. QR2.4 CPU is evidenced by Cloudflare cpuTimeP99 in docs/nfr/evidence/QR2.4-2026-11-17.json.',
    }

    writeFileSync('perf/cpu-measurement.json', `${JSON.stringify(measurement, null, 2)}\n`)
    console.log('Worker CPU measurement:', JSON.stringify(measurement))
  })
})
