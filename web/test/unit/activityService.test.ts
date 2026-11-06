import { describe, expect, it, vi } from 'vitest'
import { fetchAliasMessages, fetchBlockedMessages } from '../../src/services/activityService'

const requestJson = vi.fn()

vi.mock('../../src/services/apiClient', () => ({
  requestJson: (...args: unknown[]) => requestJson(...args),
}))

describe('activityService', () => {
  it('builds alias message queries', async () => {
    requestJson.mockResolvedValue({ items: [], nextCursor: null })

    await fetchAliasMessages('a/1', { cursor: 'c1', limit: 25 })

    expect(requestJson).toHaveBeenCalledWith('/api/aliases/a%2F1/messages?limit=25&cursor=c1', {
      signal: undefined,
    })
  })

  it('builds blocked message queries', async () => {
    requestJson.mockResolvedValue({ items: [], nextCursor: null })

    await fetchBlockedMessages({ aliasId: 'a1', cursor: 'c1', limit: 10 })

    expect(requestJson).toHaveBeenCalledWith(
      '/api/messages/blocked?aliasId=a1&limit=10&cursor=c1',
      { signal: undefined },
    )
  })
})
