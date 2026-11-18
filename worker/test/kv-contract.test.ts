import { afterEach, describe, expect, it, vi } from 'vitest'
import contract from '../../shared/kv-records.json'
import worker from '../src/index'

/**
 * QR7.3: the Worker is the other runtime that consumes the KV contract. These cases
 * drive the real handler with every shape in shared/kv-records.json, so a serializer
 * change that the API test accepts but the Worker cannot read fails here
 */

type WorkerMessage = Parameters<typeof worker.email>[0]
type WorkerEnv = Parameters<typeof worker.email>[1]
type WorkerContext = Parameters<typeof worker.email>[2]

const AliasAddress = 'contract@postern.local'

function createKv(records: Record<string, unknown>) {
  const get = vi.fn(async (key: string) =>
    Object.prototype.hasOwnProperty.call(records, key) ? records[key] : null,
  )
  return { namespace: { get } as unknown as KVNamespace, get }
}

function createMessage(from = 'Shop <orders@shop.example>') {
  const headers = new Map<string, string | null>([
    ['from', from],
    ['subject', 'Contract check'],
    ['message-id', '<contract-1@shop.example>'],
  ])
  const forward = vi.fn(async () => undefined)

  return {
    message: {
      to: AliasAddress,
      from,
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

async function ingest(fetchMock: ReturnType<typeof vi.fn>) {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return JSON.parse(init.body as string) as Record<string, unknown>
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Shared KV contract', () => {
  const aliasRecord = contract.aliasRecord.example

  it('forwards mail for the canonical alias record', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 202 }))
    vi.stubGlobal('fetch', fetchMock)
    const kv = createKv({ [AliasAddress]: aliasRecord })
    const { message, forward } = createMessage()
    const { context, settle } = createContext()

    await worker.email(message, createEnv(kv.namespace), context)
    await settle()

    expect(forward).toHaveBeenCalledWith(aliasRecord.destination)
    expect(await ingest(fetchMock)).toMatchObject({
      recipientAddress: AliasAddress,
      authenticationResult: 'unknown',
    })
  })

  it('ignores fields the contract does not define', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 202 })))
    const kv = createKv({
      [AliasAddress]: { ...aliasRecord, futureField: { anything: true } },
    })
    const { message, forward } = createMessage()
    const { context, settle } = createContext()

    await worker.email(message, createEnv(kv.namespace), context)
    await settle()

    expect(forward).toHaveBeenCalledWith(aliasRecord.destination)
  })

  it.each([
    ['disabled', 'disabled_or_replaced'],
    ['replaced', 'disabled_or_replaced'],
  ])('blocks mail for an alias whose status is %s', async (status, reason) => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const kv = createKv({ [AliasAddress]: { ...aliasRecord, status } })
    const { message, forward } = createMessage()
    const { context, settle } = createContext()

    await worker.email(message, createEnv(kv.namespace), context)
    await settle()

    expect(forward).not.toHaveBeenCalled()
    expect(await ingest(fetchMock)).toMatchObject({ blocked: true, reason })
  })

  it('blocks a sender listed in the alias record', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const kv = createKv({
      [AliasAddress]: { ...aliasRecord, blockedSenders: ['spam.example'] },
    })
    const { message, forward } = createMessage('Shop <orders@spam.example>')
    const { context, settle } = createContext()

    await worker.email(message, createEnv(kv.namespace), context)
    await settle()

    expect(forward).not.toHaveBeenCalled()
    expect(await ingest(fetchMock)).toMatchObject({ blocked: true, reason: 'blocked_sender' })
  })

  it('blocks a sender from the global blocklist example', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const kv = createKv({
      [AliasAddress]: aliasRecord,
      __global_blocklist: contract.maps.__global_blocklist.example,
    })
    const { message, forward } = createMessage('Promo <promo@spamco.example>')
    const { context, settle } = createContext()

    await worker.email(message, createEnv(kv.namespace), context)
    await settle()

    expect(forward).not.toHaveBeenCalled()
    expect(await ingest(fetchMock)).toMatchObject({ blocked: true, reason: 'global_blocklist' })
  })

  it('blocks a suspended user from the suspended map example', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const suspended = contract.maps.suspended_users.example
    const suspendedUserId = Object.keys(suspended.users)[0]
    const kv = createKv({
      [AliasAddress]: { ...aliasRecord, userId: suspendedUserId },
      suspended_users: suspended,
    })
    const { message, forward } = createMessage()
    const { context, settle } = createContext()

    await worker.email(message, createEnv(kv.namespace), context)
    await settle()

    expect(forward).not.toHaveBeenCalled()
    expect(await ingest(fetchMock)).toMatchObject({ blocked: true, reason: 'suspended_user' })
  })

  it('blocks a rate-limited user whose timestamp is still in the future', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const rateLimited = contract.maps.rate_limited_users.example
    const limitedUserId = Object.keys(rateLimited.users)[0]
    const kv = createKv({
      [AliasAddress]: { ...aliasRecord, userId: limitedUserId },
      rate_limited_users: {
        users: { [limitedUserId]: Math.floor(Date.now() / 1000) + 3_600 },
      },
    })
    const { message, forward } = createMessage()
    const { context, settle } = createContext()

    await worker.email(message, createEnv(kv.namespace), context)
    await settle()

    expect(forward).not.toHaveBeenCalled()
    expect(await ingest(fetchMock)).toMatchObject({ blocked: true, reason: 'rate_limited' })
  })
})
