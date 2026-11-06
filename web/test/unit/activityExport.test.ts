import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MailMessage } from '../../src/services/activityService'
import { exportAliasActivityCsv } from '../../src/services/activityExport'

const fetchAliasMessages = vi.fn()
const downloadCsv = vi.fn()

vi.mock('../../src/services/activityService', () => ({
  fetchAliasMessages: (...args: unknown[]) => fetchAliasMessages(...args),
}))

vi.mock('../../src/services/csvExport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/csvExport')>()
  return {
    ...actual,
    downloadCsv: (...args: unknown[]) => downloadCsv(...args),
  }
})

function message(id: number, overrides: Partial<MailMessage> = {}): MailMessage {
  return {
    id: String(id),
    aliasId: 'alias-1',
    fromHeader: `Sender ${id} <s${id}@example.com>`,
    envelopeSender: `s${id}@example.com`,
    subject: `Subject ${id}`,
    receivedAt: '2026-02-01T10:00:00Z',
    authenticationResult: 'SPF=pass, DKIM=pass, DMARC=pass',
    isFlagged: id % 2 === 0,
    flagReason: id % 2 === 0 ? 'unknown_sender' : null,
    ...overrides,
  }
}

beforeEach(() => {
  fetchAliasMessages.mockReset()
  downloadCsv.mockReset()
})

describe('exportAliasActivityCsv', () => {
  it('exports only metadata columns and never body or hash fields', async () => {
    fetchAliasMessages.mockResolvedValue({
      items: [
        {
          ...message(1),
          subject: 'hello, "world"',
          authenticationResult: 'SPF=pass',
          body: 'secret body',
          bodyHash: 'secret-hash',
        } as MailMessage & { body?: string; bodyHash?: string },
      ],
      nextCursor: null,
    })

    const result = await exportAliasActivityCsv('alias-1', 'My Shop')

    expect(result).toEqual({ rowCount: 1, limited: false })
    expect(fetchAliasMessages).toHaveBeenCalledWith('alias-1', {
      cursor: null,
      limit: 100,
      signal: undefined,
    })
    expect(downloadCsv).toHaveBeenCalledTimes(1)
    const [filename, csv] = downloadCsv.mock.calls[0] as [string, string]
    expect(filename).toBe('postern-my-shop-2026-02-01.csv')
    expect(csv).toContain('sender,subject,received-at,authentication result,flagged')
    expect(csv).toContain('"hello, ""world"""')
    expect(csv).not.toContain('secret body')
    expect(csv).not.toContain('secret-hash')
    expect(csv).not.toContain('body')
    expect(csv).not.toContain('hash')
  })

  it('walks cursor pages and stops at the 5,000 row cap', async () => {
    fetchAliasMessages
      .mockResolvedValueOnce({
        items: Array.from({ length: 100 }, (_, i) => message(i, { receivedAt: '2026-01-01T00:00:00Z' })),
        nextCursor: 'c2',
      })
      .mockResolvedValueOnce({
        items: Array.from({ length: 4900 }, (_, i) => message(100 + i, { receivedAt: '2026-01-02T00:00:00Z' })),
        nextCursor: 'c3',
      })

    const result = await exportAliasActivityCsv('alias-1', 'shop')

    expect(result).toEqual({ rowCount: 5000, limited: true })
    expect(fetchAliasMessages).toHaveBeenCalledTimes(2)
    expect(downloadCsv).toHaveBeenCalledTimes(1)
    const [, csv] = downloadCsv.mock.calls[0] as [string, string]
    expect((csv.match(/\r\n/g) ?? []).length).toBe(5001)
  })

  it('marks exports limited when more pages remain at the cap boundary', async () => {
    fetchAliasMessages.mockResolvedValue({
      items: Array.from({ length: 5000 }, (_, i) => message(i)),
      nextCursor: 'more',
    })

    const result = await exportAliasActivityCsv('alias-1', 'shop')

    expect(result).toEqual({ rowCount: 5000, limited: true })
    expect(fetchAliasMessages).toHaveBeenCalledTimes(1)
  })
})
