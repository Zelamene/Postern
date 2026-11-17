import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'

type WorkerMessage = Parameters<typeof worker.email>[0]
type WorkerEnv = Parameters<typeof worker.email>[1]
type WorkerContext = Parameters<typeof worker.email>[2]

const AliasAddress = 'budget@postern.local'
const UserId = '22222222-2222-2222-2222-222222222222'
const Destination = 'budget-forward@example.test'

const GlobalKeys = ['__global_blocklist', 'suspended_users', 'rate_limited_users']

function createKv(records: Record<string, unknown> = {}) {
  const get = vi.fn(async (key: string) =>
    Object.prototype.hasOwnProperty.call(records, key) ? records[key] : null,
  )
  const put = vi.fn(async () => undefined)
  const deleteKey = vi.fn(async () => undefined)

  return {
    namespace: { get, put, delete: deleteKey } as unknown as KVNamespace,
    get,
    put,
    deleteKey,
  }
}

function aliasRecords(overrides: Record<string, unknown> = {}) {
  return {
    [AliasAddress]: {
      destination: Destination,
      status: 'active',
      userId: UserId,
      ...overrides,
    },
  }
}

function createMessage(to: string = AliasAddress) {
  const headers = new Map<string, string | null>([
    ['from', 'Sender <sender@example.com>'],
    ['subject', 'Hello there'],
    ['message-id', '<budget-1@example.com>'],
  ])
  const forward = vi.fn(async () => undefined)

  return {
    message: {
      to,
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

describe('Postern KV budget per message', () => {
  it('reads the alias and three global maps without writing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 202 })))
    const kv = createKv(aliasRecords())
    const { message, forward } = createMessage()
    const { context, settle } = createContext()

    await worker.email(message, createEnv(kv.namespace), context)
    await settle()

    expect(forward).toHaveBeenCalledWith(Destination)
    expect(kv.get).toHaveBeenCalledTimes(4)
    expect(kv.get.mock.calls.map(([key]) => key).sort()).toEqual(
      [AliasAddress, ...GlobalKeys].sort(),
    )
    expect(kv.put).not.toHaveBeenCalled()
    expect(kv.deleteKey).not.toHaveBeenCalled()
  })

  it('reads only the alias for an unknown recipient and writes nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 202 })))
    const kv = createKv({})
    const { message, forward } = createMessage('unknown@postern.local')
    const { context, settle } = createContext()

    await worker.email(message, createEnv(kv.namespace), context)
    await settle()

    expect(forward).not.toHaveBeenCalled()
    expect(kv.get).toHaveBeenCalledTimes(1)
    expect(kv.put).not.toHaveBeenCalled()
    expect(kv.deleteKey).not.toHaveBeenCalled()
  })

  it('reads only the alias for a disabled alias and writes nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })))
    const kv = createKv(aliasRecords({ status: 'disabled' }))
    const { message, forward } = createMessage()
    const { context, settle } = createContext()

    await worker.email(message, createEnv(kv.namespace), context)
    await settle()

    expect(forward).not.toHaveBeenCalled()
    expect(kv.get).toHaveBeenCalledTimes(1)
    expect(kv.put).not.toHaveBeenCalled()
    expect(kv.deleteKey).not.toHaveBeenCalled()
  })

  // The four drop paths run after the global-map reads, so they must keep the same
  // budget as the forward path. A regression that writes KV while blocking a message
  // would otherwise only show up on the paths nobody watches.
  const blockCases: { name: string; records: Record<string, unknown> }[] = [
    {
      name: 'global blocklist',
      records: { ...aliasRecords(), __global_blocklist: { domains: ['example.com'] } },
    },
    {
      name: 'blocked sender',
      records: { ...aliasRecords({ blockedSenders: ['example.com'] }) },
    },
    {
      name: 'suspended user',
      records: { ...aliasRecords(), suspended_users: { users: { [UserId]: true } } },
    },
    {
      name: 'rate-limited user',
      records: {
        ...aliasRecords(),
        rate_limited_users: { users: { [UserId]: Math.floor(Date.now() / 1000) + 600 } },
      },
    },
  ]

  it.each(blockCases)(
    'reads the alias and three global maps without writing on the $name path',
    async ({ records }) => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })))
      const kv = createKv(records)
      const { message, forward } = createMessage()
      const { context, settle } = createContext()

      await worker.email(message, createEnv(kv.namespace), context)
      await settle()

      expect(forward).not.toHaveBeenCalled()
      expect(kv.get).toHaveBeenCalledTimes(4)
      expect(kv.get.mock.calls.map(([key]) => key).sort()).toEqual(
        [AliasAddress, ...GlobalKeys].sort(),
      )
      expect(kv.put).not.toHaveBeenCalled()
      expect(kv.deleteKey).not.toHaveBeenCalled()
    },
  )
})
