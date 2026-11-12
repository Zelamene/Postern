import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'

type WorkerMessage = Parameters<typeof worker.email>[0]
type WorkerEnv = Parameters<typeof worker.email>[1]
type WorkerContext = Parameters<typeof worker.email>[2]

const AliasAddress = 'known@postern.local'
const UserId = '11111111-1111-1111-1111-111111111111'
const Destination = 'forward@example.test'
const IngestEndpoint = 'https://api.postern.test/api/ingest'

interface NamedAliasRecord {
  destination?: string
  status?: string
  userId?: string
  blockedSenders?: string[]
}

function createKv(records: Record<string, unknown> = {}) {
  const get = vi.fn(async (key: string) => (Object.prototype.hasOwnProperty.call(records, key) ? records[key] : null))
  return { namespace: { get } as unknown as KVNamespace, get }
}

function aliasRecords(alias: NamedAliasRecord = {}) {
  return {
    [AliasAddress]: {
      destination: Destination,
      status: 'active',
      userId: UserId,
      ...alias,
    },
  }
}

interface MessageOverrides {
  to?: string
  from?: string
  headers?: Record<string, string | null>
  forward?: (destination: string) => Promise<void>
}

function createMessage(overrides: MessageOverrides = {}) {
  const headerValues = new Map<string, string | null>(
    Object.entries({
      from: 'Sender <sender@example.com>',
      subject: 'Hello there',
      'message-id': '<message-1@example.com>',
      ...overrides.headers,
    }).map(([key, value]) => [key.toLowerCase(), value]),
  )

  const forward = vi.fn(overrides.forward ?? (async () => undefined))

  return {
    message: {
      to: overrides.to ?? AliasAddress,
      from: overrides.from ?? 'sender@example.com',
      headers: { get: (name: string) => headerValues.get(name.toLowerCase()) ?? null },
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
    INGEST_ENDPOINT: IngestEndpoint,
    INGEST_SECRET: 'worker-test-secret',
    API_BASE_URL: 'https://api.postern.test',
    JOB_SECRET: 'worker-test-job-secret',
    POSTERN_DOMAIN: 'postern.local',
  } as unknown as WorkerEnv
}

function stubFetch(implementation: typeof fetch) {
  const fetchMock = vi.fn(implementation)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function ingestPayload(fetchMock: ReturnType<typeof stubFetch>) {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  return JSON.parse(init.body as string) as Record<string, unknown>
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Postern email worker', () => {
  it('forwards allowed mail and records accepted activity with the message id', async () => {
    const { namespace } = createKv(aliasRecords())
    const fetchMock = stubFetch(async () => new Response(null, { status: 202 }))
    const { message, forward } = createMessage({
      headers: { 'authentication-results': 'mx.example; dkim=pass' },
    })
    const { context, settle } = createContext()

    await worker.email(message, createEnv(namespace), context)
    await settle()

    expect(forward).toHaveBeenCalledWith(Destination)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      IngestEndpoint,
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Postern-Ingest-Secret': 'worker-test-secret' }),
      }),
    )
    expect(await ingestPayload(fetchMock)).toEqual({
      recipientAddress: AliasAddress,
      envelopeSender: 'sender@example.com',
      fromHeader: 'Sender <sender@example.com>',
      subject: 'Hello there',
      authenticationResult: 'pass',
      messageId: '<message-1@example.com>',
    })
  })

  it('keeps forwarding when the backend ingest endpoint is unavailable', async () => {
    const { namespace } = createKv(aliasRecords())
    const fetchMock = stubFetch(async () => {
      throw new Error('backend unavailable')
    })
    const { message, forward } = createMessage()
    const { context, settle } = createContext()

    await worker.email(message, createEnv(namespace), context)
    await expect(settle()).resolves.toBeDefined()

    expect(forward).toHaveBeenCalledWith(Destination)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['disabled', 'disabled_or_replaced'],
    ['replaced', 'disabled_or_replaced'],
  ])('records blocked activity for %s aliases without forwarding', async (status, reason) => {
    const { namespace } = createKv(aliasRecords({ status }))
    const fetchMock = stubFetch(async () => new Response(null, { status: 200 }))
    const { message, forward } = createMessage()
    const { context, settle } = createContext()

    await worker.email(message, createEnv(namespace), context)
    await settle()

    expect(forward).not.toHaveBeenCalled()
    const payload = await ingestPayload(fetchMock)
    expect(payload).toMatchObject({
      blocked: true,
      reason,
      authenticationResult: 'unknown',
      messageId: '<message-1@example.com>',
    })
  })

  it('drops mail for suspended users without forwarding or recording activity', async () => {
    const { namespace } = createKv({
      ...aliasRecords(),
      suspended_users: { users: { [UserId]: true } },
    })
    const fetchMock = stubFetch(async () => new Response(null, { status: 200 }))
    const { message, forward } = createMessage()
    const { context, settle } = createContext()

    await worker.email(message, createEnv(namespace), context)
    await settle()

    expect(forward).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('blocks mail while a user is rate limited', async () => {
    const until = Math.floor(Date.now() / 1000) + 600
    const { namespace } = createKv({
      ...aliasRecords(),
      rate_limited_users: { users: { [UserId]: until } },
    })
    const fetchMock = stubFetch(async () => new Response(null, { status: 200 }))
    const { message, forward } = createMessage()
    const { context, settle } = createContext()

    await worker.email(message, createEnv(namespace), context)
    await settle()

    expect(forward).not.toHaveBeenCalled()
    expect(await ingestPayload(fetchMock)).toMatchObject({ blocked: true, reason: 'rate_limited' })
  })

  it('forwards mail once a rate limit has expired', async () => {
    const until = Math.floor(Date.now() / 1000) - 600
    const { namespace } = createKv({
      ...aliasRecords(),
      rate_limited_users: { users: { [UserId]: until } },
    })
    const fetchMock = stubFetch(async () => new Response(null, { status: 200 }))
    const { message, forward } = createMessage()
    const { context, settle } = createContext()

    await worker.email(message, createEnv(namespace), context)
    await settle()

    expect(forward).toHaveBeenCalledWith(Destination)
    expect(await ingestPayload(fetchMock)).not.toHaveProperty('blocked')
  })

  it('blocks mail from a globally blocklisted domain', async () => {
    const { namespace } = createKv({
      ...aliasRecords(),
      __global_blocklist: { domains: ['spamco.example'] },
    })
    const fetchMock = stubFetch(async () => new Response(null, { status: 200 }))
    const { message, forward } = createMessage({
      headers: { from: 'Promo <promo@mail.spamco.example>' },
    })
    const { context, settle } = createContext()

    await worker.email(message, createEnv(namespace), context)
    await settle()

    expect(forward).not.toHaveBeenCalled()
    expect(await ingestPayload(fetchMock)).toMatchObject({
      blocked: true,
      reason: 'global_blocklist',
      fromHeader: 'Promo <promo@mail.spamco.example>',
    })
  })

  it('blocks mail from a sender blocked on the alias', async () => {
    const { namespace } = createKv(aliasRecords({ blockedSenders: ['store.example'] }))
    const fetchMock = stubFetch(async () => new Response(null, { status: 200 }))
    const { message, forward } = createMessage({ headers: { from: 'Store <orders@store.example>' } })
    const { context, settle } = createContext()

    await worker.email(message, createEnv(namespace), context)
    await settle()

    expect(forward).not.toHaveBeenCalled()
    expect(await ingestPayload(fetchMock)).toMatchObject({ blocked: true, reason: 'blocked_sender' })
  })

  it('still forwards unexpected senders and reports the failing authentication result', async () => {
    const { namespace } = createKv(aliasRecords())
    const fetchMock = stubFetch(async () => new Response(null, { status: 200 }))
    const { message, forward } = createMessage({
      headers: { 'authentication-results': 'mx.example; spf=fail' },
    })
    const { context, settle } = createContext()

    await worker.email(message, createEnv(namespace), context)
    await settle()

    expect(forward).toHaveBeenCalledWith(Destination)
    expect(await ingestPayload(fetchMock)).toMatchObject({ authenticationResult: 'fail' })
  })

  it.each([
    ['mx.example; dkim=none', 'none'],
    ['mx.example; no results', 'unknown'],
  ])('maps %s to the %s authentication result', async (authenticationResults, expected) => {
    const { namespace } = createKv(aliasRecords())
    const fetchMock = stubFetch(async () => new Response(null, { status: 200 }))
    const { message } = createMessage({ headers: { 'authentication-results': authenticationResults } })
    const { context, settle } = createContext()

    await worker.email(message, createEnv(namespace), context)
    await settle()

    expect(await ingestPayload(fetchMock)).toMatchObject({ authenticationResult: expected })
  })

  it('records a null message id when the header is missing', async () => {
    const { namespace } = createKv(aliasRecords())
    const fetchMock = stubFetch(async () => new Response(null, { status: 200 }))
    const { message } = createMessage({ headers: { 'message-id': null } })
    const { context, settle } = createContext()

    await worker.email(message, createEnv(namespace), context)
    await settle()

    expect(await ingestPayload(fetchMock)).toMatchObject({ messageId: null })
  })

  it('ignores mail with no recipient', async () => {
    const { namespace, get } = createKv(aliasRecords())
    const fetchMock = stubFetch(async () => new Response(null, { status: 200 }))
    const { message, forward } = createMessage({ to: '' })
    const { context, settle } = createContext()

    await worker.email(message, createEnv(namespace), context)
    await settle()

    expect(get).not.toHaveBeenCalled()
    expect(forward).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ignores mail for addresses without an alias record', async () => {
    const { namespace } = createKv()
    const fetchMock = stubFetch(async () => new Response(null, { status: 200 }))
    const { message, forward } = createMessage()
    const { context, settle } = createContext()

    await worker.email(message, createEnv(namespace), context)
    await settle()

    expect(forward).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not record activity when forwarding fails', async () => {
    const { namespace } = createKv(aliasRecords())
    const fetchMock = stubFetch(async () => new Response(null, { status: 200 }))
    const { message } = createMessage({
      forward: async () => {
        throw new Error('destination rejected')
      },
    })
    const { context, settle } = createContext()

    await worker.email(message, createEnv(namespace), context)
    await settle()

    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('Postern scheduled handler', () => {
  it('posts the nightly job with the job secret on the 03:05 trigger', async () => {
    const fetchMock = stubFetch(async () => new Response(null, { status: 200 }))
    const { namespace } = createKv({})
    const { context, settle } = createContext()

    await worker.scheduled(
      { cron: '5 3 * * *' } as ScheduledController,
      createEnv(namespace),
      context,
    )
    await settle()

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.postern.test/api/jobs/nightly',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Postern-Job-Secret': 'worker-test-job-secret' }),
      }),
    )
  })

  it('pings the health endpoint on the ten minute trigger', async () => {
    const fetchMock = stubFetch(async () => new Response(null, { status: 200 }))
    const { namespace } = createKv({})
    const { context, settle } = createContext()

    await worker.scheduled(
      { cron: '*/10 * * * *' } as ScheduledController,
      createEnv(namespace),
      context,
    )
    await settle()

    expect(fetchMock).toHaveBeenCalledWith('https://api.postern.test/health')
  })
})

describe('Postern worker eTLD+1 handling', () => {
  it('matches a blocked sender on a second-level domain', async () => {
    const { namespace } = createKv(aliasRecords({ blockedSenders: ['shop.co.uk'] }))
    const fetchMock = stubFetch(async () => new Response(null, { status: 200 }))
    const { message, forward } = createMessage({ headers: { from: 'Shop <orders@mail.shop.co.uk>' } })
    const { context, settle } = createContext()

    await worker.email(message, createEnv(namespace), context)
    await settle()

    expect(forward).not.toHaveBeenCalled()
    expect(await ingestPayload(fetchMock)).toMatchObject({ blocked: true, reason: 'blocked_sender' })
  })
})
