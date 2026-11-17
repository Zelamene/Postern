import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'

type WorkerMessage = Parameters<typeof worker.email>[0]
type WorkerEnv = Parameters<typeof worker.email>[1]
type WorkerContext = Parameters<typeof worker.email>[2]

const AliasAddress = 'resilience@postern.local'
const UserId = '33333333-3333-3333-3333-333333333333'
const Destination = 'resilience-forward@example.test'

function createKv() {
  const records: Record<string, unknown> = {
    [AliasAddress]: {
      destination: Destination,
      status: 'active',
      userId: UserId,
    },
  }
  const get = vi.fn(async (key: string) =>
    Object.prototype.hasOwnProperty.call(records, key) ? records[key] : null,
  )
  return { namespace: { get } as unknown as KVNamespace, get }
}

function createMessage() {
  const headers = new Map<string, string | null>([
    ['from', 'Sender <sender@example.com>'],
    ['subject', 'Hello there'],
    ['message-id', '<resilience-1@example.com>'],
  ])
  const forward = vi.fn(async () => undefined)

  return {
    message: {
      to: AliasAddress,
      from: 'sender@example.com',
      headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
      forward,
    } as unknown as WorkerMessage,
    forward,
  }
}

function createContext() {
  const pending: Promise<unknown>[] = []
  const context = {
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise)
    },
  } as unknown as WorkerContext

  return { context, settle: () => Promise.all(pending) }
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

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Mail forwarding when the management API is unavailable', () => {
  it('forwards when the ingest request fails at the network level', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed')
      }),
    )
    const kv = createKv()
    const { message, forward } = createMessage()
    const { context, settle } = createContext()

    await expect(
      worker.email(message, createEnv(kv.namespace), context),
    ).resolves.toBeUndefined()
    await settle()

    expect(forward).toHaveBeenCalledTimes(1)
    expect(forward).toHaveBeenCalledWith(Destination)
  })

  it('forwards when the ingest endpoint answers with a server error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })))
    const kv = createKv()
    const { message, forward } = createMessage()
    const { context, settle } = createContext()

    await worker.email(message, createEnv(kv.namespace), context)
    await settle()

    expect(forward).toHaveBeenCalledTimes(1)
    expect(forward).toHaveBeenCalledWith(Destination)
  })

  it('forwards when the ingest endpoint never answers within the request lifetime', async () => {
  
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    )
    const kv = createKv()
    const { message, forward } = createMessage()
    const { context } = createContext()

    await worker.email(message, createEnv(kv.namespace), context)

    expect(forward).toHaveBeenCalledTimes(1)
    expect(forward).toHaveBeenCalledWith(Destination)
  })
})
