import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAliasMessages } from '../../src/hooks/useActivity'

const fetchAliasMessages = vi.fn()

vi.mock('../../src/services/activityService', () => ({
  fetchAliasMessages: (...args: unknown[]) => fetchAliasMessages(...args),
  fetchBlockedMessages: vi.fn(),
}))

beforeEach(() => {
  fetchAliasMessages.mockReset()
})

describe('useAliasMessages', () => {
  it('stays idle without an alias', () => {
    const { result } = renderHook(() => useAliasMessages(null))
    expect(result.current.status).toBe('idle')
    expect(fetchAliasMessages).not.toHaveBeenCalled()
  })

  it('loads the first page and can load more', async () => {
    fetchAliasMessages
      .mockResolvedValueOnce({ items: [{ id: '1' }], nextCursor: 'c2' })
      .mockResolvedValueOnce({ items: [{ id: '2' }], nextCursor: null })

    const { result } = renderHook(() => useAliasMessages('alias-1'))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.items).toHaveLength(1)
    expect(result.current.hasMore).toBe(true)

    await act(async () => {
      await result.current.loadMore()
    })

    expect(result.current.items).toHaveLength(2)
    expect(result.current.hasMore).toBe(false)
  })

  it('reports load errors', async () => {
    fetchAliasMessages.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useAliasMessages('alias-1'))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBeTruthy()
  })
})
