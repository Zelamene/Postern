import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../src/services/apiClient'
import { useAliasMessages, useBlockedMessages } from '../../src/hooks/useActivity'

const fetchAliasMessages = vi.fn()
const fetchBlockedMessages = vi.fn()

vi.mock('../../src/services/activityService', () => ({
  fetchAliasMessages: (...args: unknown[]) => fetchAliasMessages(...args),
  fetchBlockedMessages: (...args: unknown[]) => fetchBlockedMessages(...args),
}))

beforeEach(() => {
  fetchAliasMessages.mockReset()
  fetchBlockedMessages.mockReset()
})

describe('useAliasMessages', () => {
  it('stays idle without an alias', () => {
    const { result } = renderHook(() => useAliasMessages(null))
    expect(result.current.status).toBe('idle')
    expect(result.current.items).toEqual([])
    expect(result.current.hasMore).toBe(false)
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
    expect(result.current.isLoadingMore).toBe(false)
  })

  it('does nothing when loading more without another page', async () => {
    fetchAliasMessages.mockResolvedValueOnce({ items: [{ id: '1' }], nextCursor: null })

    const { result } = renderHook(() => useAliasMessages('alias-1'))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => {
      await result.current.loadMore()
    })

    expect(fetchAliasMessages).toHaveBeenCalledTimes(1)
  })

  it('reports a generic load error', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fetchAliasMessages.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useAliasMessages('alias-1'))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toMatch(/Activity could not be loaded/i)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('asks the visitor to sign in when the session has ended', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fetchAliasMessages.mockRejectedValueOnce(new ApiError(401))

    const { result } = renderHook(() => useAliasMessages('alias-1'))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toMatch(/session has ended/i)
    errorSpy.mockRestore()
  })

  it('explains when the alias no longer exists', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fetchAliasMessages.mockRejectedValueOnce(new ApiError(404))

    const { result } = renderHook(() => useAliasMessages('alias-1'))

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toMatch(/could not be found/i)
    errorSpy.mockRestore()
  })

  it('keeps the loaded page when loading more fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fetchAliasMessages
      .mockResolvedValueOnce({ items: [{ id: '1' }], nextCursor: 'c2' })
      .mockRejectedValueOnce(new ApiError(404))

    const { result } = renderHook(() => useAliasMessages('alias-1'))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => {
      await result.current.loadMore()
    })

    expect(result.current.items).toHaveLength(1)
    expect(result.current.hasMore).toBe(true)
    expect(result.current.error).toMatch(/could not be found/i)
    expect(result.current.isLoadingMore).toBe(false)
    errorSpy.mockRestore()
  })

  it('refreshes from the first page', async () => {
    fetchAliasMessages
      .mockResolvedValueOnce({ items: [{ id: '1' }], nextCursor: 'c2' })
      .mockResolvedValueOnce({ items: [{ id: '3' }, { id: '4' }], nextCursor: null })

    const { result } = renderHook(() => useAliasMessages('alias-1'))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => {
      await result.current.refresh()
    })

    expect(fetchAliasMessages).toHaveBeenCalledTimes(2)
    expect(fetchAliasMessages).toHaveBeenLastCalledWith('alias-1', {
      cursor: null,
      limit: 25,
      signal: expect.any(AbortSignal),
    })
    expect(result.current.items).toHaveLength(2)
    expect(result.current.hasMore).toBe(false)
  })

  it('keeps the current page when refreshing fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fetchAliasMessages
      .mockResolvedValueOnce({ items: [{ id: '1' }], nextCursor: null })
      .mockRejectedValueOnce(new Error('down'))

    const { result } = renderHook(() => useAliasMessages('alias-1'))
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => {
      await result.current.refresh()
    })

    expect(result.current.status).toBe('ready')
    expect(result.current.items).toHaveLength(1)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})

describe('useBlockedMessages', () => {
  it('stays idle and does not request while disabled', () => {
    const { result } = renderHook(() => useBlockedMessages(false))

    expect(result.current.status).toBe('idle')
    expect(result.current.items).toEqual([])
    expect(fetchBlockedMessages).not.toHaveBeenCalled()
  })

  it('loads blocked messages when enabled', async () => {
    fetchBlockedMessages.mockResolvedValueOnce({
      items: [{ id: 'blocked-1' }],
      nextCursor: 'next',
    })

    const { result } = renderHook(() => useBlockedMessages(true))

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.items).toHaveLength(1)
    expect(result.current.hasMore).toBe(true)
    expect(fetchBlockedMessages).toHaveBeenCalledWith({
      cursor: null,
      limit: 25,
      signal: expect.any(AbortSignal),
    })
  })

  it('resets to idle when the feed is disabled again', async () => {
    fetchBlockedMessages.mockResolvedValueOnce({ items: [{ id: 'blocked-1' }], nextCursor: null })

    const { result, rerender } = renderHook(({ enabled }) => useBlockedMessages(enabled), {
      initialProps: { enabled: true },
    })

    await waitFor(() => expect(result.current.status).toBe('ready'))

    rerender({ enabled: false })

    expect(result.current.status).toBe('idle')
    expect(result.current.items).toEqual([])
    expect(result.current.hasMore).toBe(false)
  })
})
