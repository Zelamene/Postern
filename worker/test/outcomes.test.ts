import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, {
  BLOCKED_REASONS,
  MAIL_PATH_SUMMARY_KEY,
  MONTHLY_OUTCOMES_CRON,
  OUTCOMES,
  OUTCOMES_DATASET,
  buildOutcomesQuery,
  previousMonthWindow,
} from '../src/index'
import type { MailPathSummary } from '../src/index'

type WorkerMessage = Parameters<typeof worker.email>[0]
type WorkerEnv = Parameters<typeof worker.email>[1]
type WorkerContext = Parameters<typeof worker.email>[2]
type ScheduledController = Parameters<typeof worker.scheduled>[0]

const AliasAddress = 'outcomes@postern.local'
const UserId = '44444444-4444-4444-4444-444444444444'
const Destination = 'outcomes-forward@example.test'
const IngestEndpoint = 'https://api.postern.test/api/ingest'

function createAnalytics() {
  const writeDataPoint = vi.fn()
  return { dataset: { writeDataPoint } as unknown as AnalyticsEngineDataset, writeDataPoint }
}

function createKv(records: Record<string, unknown> = {}) {
  const get = vi.fn(async (key: string) =>
    Object.prototype.hasOwnProperty.call(records, key) ? records[key] : null,
  )
  const put = vi.fn(async () => undefined)
  return { namespace: { get, put } as unknown as KVNamespace, get, put }
}

function aliasRecord(overrides: Record<string, unknown> = {}) {
  return {
    [AliasAddress]: {
      destination: Destination,
      status: 'active',
      userId: UserId,
      blockedSenders: [] as string[],
      ...overrides,
    },
  }
}

function createMessage(
  to = AliasAddress,
  from = 'Sender <sender@example.com>',
  forwardImpl: (destination: string) => Promise<void> = async () => undefined,
) {
  const headers = new Map<string, string | null>([
    ['from', from],
    ['subject', 'Outcome check'],
    ['message-id', '<outcome-1@example.com>'],
  ])
  const forward = vi.fn(forwardImpl)
  return {
    message: {
      to,
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

function createEnv(
  kv: KVNamespace,
  analytics?: AnalyticsEngineDataset,
  withCredentials = false,
): WorkerEnv {
  return {
    POSTERN_KV: kv,
    POSTERN_OUTCOMES: analytics,
    CF_ACCOUNT_ID: withCredentials ? 'account-with-32-characters-0000' : undefined,
    CF_API_TOKEN: withCredentials ? 'cf-test-token' : undefined,
    INGEST_ENDPOINT: IngestEndpoint,
    INGEST_SECRET: 'worker-test-secret',
    API_BASE_URL: 'https://api.postern.test',
    JOB_SECRET: 'worker-test-job-secret',
  } as unknown as WorkerEnv
}

function stubFetch(status = 202) {
  const fetchMock = vi.fn(async () => new Response(null, { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('QR4.3 per-message outcome counters', () => {
  it('emits one forwarded point and no KV write for an allowed message', async () => {
    stubFetch()
    const kv = createKv(aliasRecord())
    const analytics = createAnalytics()
    const { message, forward } = createMessage()
    const { context, settle } = createContext()

    await worker.email(message, createEnv(kv.namespace, analytics.dataset), context)
    await settle()

    expect(forward).toHaveBeenCalledWith(Destination)
    expect(analytics.writeDataPoint).toHaveBeenCalledTimes(1)
    expect(analytics.writeDataPoint).toHaveBeenCalledWith({
      indexes: [OUTCOMES.forwarded],
      blobs: [''],
      doubles: [1],
    })
    expect(kv.get).toHaveBeenCalledTimes(4)
    expect(kv.put).not.toHaveBeenCalled()
  })

  it('emits one errored point when policy-permitted forwarding fails', async () => {
    const kv = createKv(aliasRecord())
    const analytics = createAnalytics()
    const { message } = createMessage(AliasAddress, undefined, async () => {
      throw new Error('relay unavailable')
    })
    const { context, settle } = createContext()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await worker.email(message, createEnv(kv.namespace, analytics.dataset), context)
    await settle()

    expect(analytics.writeDataPoint).toHaveBeenCalledTimes(1)
    expect(analytics.writeDataPoint).toHaveBeenCalledWith({
      indexes: [OUTCOMES.errored],
      blobs: [''],
      doubles: [1],
    })
    expect(warn).toHaveBeenCalled()
  })

  it.each([
    ['disabled', BLOCKED_REASONS.disabledOrReplaced],
    ['replaced', BLOCKED_REASONS.disabledOrReplaced],
  ])('emits a dropped point with reason for status %s', async (status, reason) => {
    stubFetch(200)
    const kv = createKv(aliasRecord({ status }))
    const analytics = createAnalytics()
    const { message } = createMessage()
    const { context, settle } = createContext()

    await worker.email(message, createEnv(kv.namespace, analytics.dataset), context)
    await settle()

    expect(analytics.writeDataPoint).toHaveBeenCalledTimes(1)
    expect(analytics.writeDataPoint).toHaveBeenCalledWith({
      indexes: [OUTCOMES.dropped],
      blobs: [reason],
      doubles: [1],
    })
  })

  it('emits a dropped point for each policy reason', async () => {
    const defaultFrom = 'Sender <sender@example.com>'
    const cases: Array<[string, Record<string, unknown>, string, string, string]> = [
      ['suspended user', { suspended_users: { users: { [UserId]: true } } }, AliasAddress, BLOCKED_REASONS.suspendedUser, defaultFrom],
      [
        'rate limited user',
        { rate_limited_users: { users: { [UserId]: Math.floor(Date.now() / 1000) + 3600 } } },
        AliasAddress,
        BLOCKED_REASONS.rateLimited,
        defaultFrom,
      ],
      [
        'global blocklist',
        { __global_blocklist: { domains: ['spamco.example'] } },
        AliasAddress,
        BLOCKED_REASONS.globalBlocklist,
        'Promo <promo@spamco.example>',
      ],
      [
        'blocked sender',
        aliasRecord({ blockedSenders: ['spam.example'] }),
        AliasAddress,
        BLOCKED_REASONS.blockedSender,
        'Sender <orders@spam.example>',
      ],
    ]

    for (const [label, recordsOverride, recipient, reason, from] of cases) {
      stubFetch(200)
      const records = recordsOverride[AliasAddress]
        ? recordsOverride
        : { ...aliasRecord(), ...recordsOverride }
      const kv = createKv(records)
      const analytics = createAnalytics()
      const { message } = createMessage(recipient, from)
      const { context, settle } = createContext()

      await worker.email(message, createEnv(kv.namespace, analytics.dataset), context)
      await settle()

      expect(analytics.writeDataPoint, label).toHaveBeenCalledTimes(1)
      expect(analytics.writeDataPoint, label).toHaveBeenCalledWith({
        indexes: [OUTCOMES.dropped],
        blobs: [reason],
        doubles: [1],
      })
    }
  })

  it('counts an unknown recipient as a drop without storing an address', async () => {
    stubFetch(200)
    const kv = createKv({})
    const analytics = createAnalytics()
    const { message } = createMessage('nobody@postern.local')
    const { context, settle } = createContext()

    await worker.email(message, createEnv(kv.namespace, analytics.dataset), context)
    await settle()

    expect(analytics.writeDataPoint).toHaveBeenCalledWith({
      indexes: [OUTCOMES.dropped],
      blobs: ['unknown_recipient'],
      doubles: [1],
    })
    expect(kv.get).toHaveBeenCalledTimes(1)
    expect(kv.put).not.toHaveBeenCalled()
  })

  it('keeps forwarding when the analytics binding is missing or the write throws', async () => {
    stubFetch()
    const { message } = createMessage()
    const { context: noBindingContext, settle: noBindingSettle } = createContext()
    await worker.email(message, createEnv(createKv(aliasRecord()).namespace), noBindingContext)
    await noBindingSettle()

    const analytics = createAnalytics()
    analytics.writeDataPoint.mockImplementation(() => {
      throw new Error('analytics unavailable')
    })
    const { message: second } = createMessage()
    const { context, settle } = createContext()
    await worker.email(second, createEnv(createKv(aliasRecord()).namespace, analytics.dataset), context)
    await settle()

    expect(analytics.writeDataPoint).toHaveBeenCalledTimes(1)
  })
})

describe('QR4.3 monthly aggregation', () => {
  it('uses the previous UTC month, including the January rollover', () => {
    expect(previousMonthWindow(new Date('2026-11-18T12:34:56Z'))).toEqual({
      start: new Date('2026-10-01T00:00:00Z'),
      end: new Date('2026-11-01T00:00:00Z'),
    })
    expect(previousMonthWindow(new Date('2026-01-15T00:00:00Z'))).toEqual({
      start: new Date('2025-12-01T00:00:00Z'),
      end: new Date('2026-01-01T00:00:00Z'),
    })
  })

  it('builds a sampling-aware SQL query and rejects an unsafe dataset name', () => {
    const { start, end } = previousMonthWindow(new Date('2026-11-18T00:00:00Z'))
    const query = buildOutcomesQuery(start, end)

    expect(query).toContain('SUM(_sample_interval) AS n')
    expect(query).toContain(`FROM ${OUTCOMES_DATASET}`)
    expect(query).toContain("timestamp >= toDateTime('2026-10-01 00:00:00')")
    expect(query).toContain("timestamp < toDateTime('2026-11-01 00:00:00')")
    expect(query).toContain('GROUP BY index1')
    expect(() => buildOutcomesQuery(start, end, 'outcomes; DROP TABLE x')).toThrow()
  })

  it('stores the previous month summary with mail-path availability', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-18T12:00:00Z'))
    try {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({
        data: [
          { outcome: OUTCOMES.forwarded, n: '990' },
          { outcome: OUTCOMES.errored, n: '10' },
          { outcome: OUTCOMES.dropped, n: '7' },
          { outcome: 'not_an_outcome', n: '5' },
        ],
      }), { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      const kv = createKv()
      const controller = { cron: MONTHLY_OUTCOMES_CRON } as unknown as ScheduledController
      const { context, settle } = createContext()

      await worker.scheduled(controller, createEnv(kv.namespace, undefined, true), context)
      await settle()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
      expect(url).toContain('/accounts/account-with-32-characters-0000/analytics_engine/sql')
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer cf-test-token')
      expect(init.body).toContain("timestamp >= toDateTime('2026-10-01 00:00:00')")

      expect(kv.put).toHaveBeenCalledTimes(1)
      const [key, value] = kv.put.mock.calls[0] as unknown as [string, string]
      expect(key).toBe(MAIL_PATH_SUMMARY_KEY)
      const summary = JSON.parse(value) as MailPathSummary
      expect(summary.windowStart).toBe('2026-10-01T00:00:00.000Z')
      expect(summary.windowEnd).toBe('2026-11-01T00:00:00.000Z')
      expect(summary).toMatchObject({ forwarded: 990, errored: 10, dropped: 7 })
      expect(summary.mailPathPct).toBe(99)
    } finally {
      vi.useRealTimers()
    }
  })

  it('records null availability when no eligible mail was seen', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-18T12:00:00Z'))
    try {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
        data: [{ outcome: OUTCOMES.dropped, n: '12' }],
      }), { status: 200 })))
      const kv = createKv()
      const controller = { cron: MONTHLY_OUTCOMES_CRON } as unknown as ScheduledController
      const { context, settle } = createContext()

      await worker.scheduled(controller, createEnv(kv.namespace, undefined, true), context)
      await settle()

      const [, value] = kv.put.mock.calls[0] as unknown as [string, string]
      expect((JSON.parse(value) as MailPathSummary).mailPathPct).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does nothing when Cloudflare query credentials are absent', async () => {
    const fetchMock = stubFetch()
    const kv = createKv()
    const controller = { cron: MONTHLY_OUTCOMES_CRON } as unknown as ScheduledController
    const { context, settle } = createContext()

    await worker.scheduled(controller, createEnv(kv.namespace), context)
    await settle()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(kv.put).not.toHaveBeenCalled()
  })
})
