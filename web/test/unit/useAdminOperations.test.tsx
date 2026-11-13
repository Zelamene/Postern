import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminApiError } from '../../src/services/adminService'
import { useAdminOperations } from '../../src/hooks/useAdminOperations'

const fetchAdminAnalytics = vi.fn()
const fetchBlocklist = vi.fn()
const addBlockedDomain = vi.fn()
const removeBlockedDomain = vi.fn()
const syncAdminKv = vi.fn()

vi.mock('../../src/services/adminService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/adminService')>()
  return {
    ...actual,
    fetchAdminAnalytics: (...args: unknown[]) => fetchAdminAnalytics(...args),
    fetchBlocklist: (...args: unknown[]) => fetchBlocklist(...args),
    addBlockedDomain: (...args: unknown[]) => addBlockedDomain(...args),
    removeBlockedDomain: (...args: unknown[]) => removeBlockedDomain(...args),
    syncAdminKv: (...args: unknown[]) => syncAdminKv(...args),
  }
})

const ANALYTICS = {
  windowHours: 24,
  totals: { kvDirtyAliases: 3 },
} as never

const BLOCKLIST = {
  domains: ['spam.example'],
  entries: [{ domain: 'spam.example', reason: 'reported', createdAt: '2026-11-01T10:00:00Z' }],
} as never

const SYNC_RESULT = {
  aliasesSynced: 2,
  aliasesFailed: 0,
  aliasesRemoved: 0,
  remainingDirtyAliases: 0,
  globalBlocklistRebuilt: true,
  suspendedUsersRebuilt: true,
} as never

beforeEach(() => {
  fetchAdminAnalytics.mockReset()
  fetchBlocklist.mockReset()
  addBlockedDomain.mockReset()
  removeBlockedDomain.mockReset()
  syncAdminKv.mockReset()
})

describe('useAdminOperations', () => {
  it('loads analytics and the blocklist when enabled', async () => {
    fetchAdminAnalytics.mockResolvedValue(ANALYTICS)
    fetchBlocklist.mockResolvedValue(BLOCKLIST)

    const { result } = renderHook(() => useAdminOperations(true))

    await waitFor(() => expect(result.current.isAnalyticsLoading).toBe(false))
    await waitFor(() => expect(result.current.isBlocklistLoading).toBe(false))

    expect(result.current.analytics).toEqual(ANALYTICS)
    expect(result.current.blocklist).toEqual(BLOCKLIST)
    expect(result.current.analyticsError).toBeNull()
    expect(result.current.blocklistError).toBeNull()
    expect(result.current.windowHours).toBe(24)
    expect(fetchAdminAnalytics).toHaveBeenCalledWith(24)
  })

  it('does not call the admin API while disabled', async () => {
    const { result } = renderHook(() => useAdminOperations(false))

    await act(async () => {
      await result.current.refresh()
    })

    expect(fetchAdminAnalytics).not.toHaveBeenCalled()
    expect(fetchBlocklist).not.toHaveBeenCalled()
    expect(result.current.analytics).toBeNull()
  })

  it('reloads both panels when the analytics window changes', async () => {
    fetchAdminAnalytics.mockResolvedValue(ANALYTICS)
    fetchBlocklist.mockResolvedValue(BLOCKLIST)

    const { result } = renderHook(() => useAdminOperations(true))
    await waitFor(() => expect(result.current.isAnalyticsLoading).toBe(false))

    act(() => result.current.setWindowHours(168))

    await waitFor(() => expect(fetchAdminAnalytics).toHaveBeenLastCalledWith(168))
    expect(result.current.windowHours).toBe(168)
    expect(fetchBlocklist).toHaveBeenCalledTimes(2)
  })

  it('surfaces errors without discarding the rest of the dashboard', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fetchAdminAnalytics.mockRejectedValue(new Error('analytics down'))
    fetchBlocklist.mockRejectedValue(new Error('blocklist down'))

    const { result } = renderHook(() => useAdminOperations(true))

    await waitFor(() => expect(result.current.analyticsError).toBeTruthy())
    expect(result.current.analyticsError).toMatch(/Analytics could not be loaded/i)
    expect(result.current.blocklistError).toMatch(/blocklist could not be loaded/i)
    expect(result.current.isAnalyticsLoading).toBe(false)
    expect(result.current.isBlocklistLoading).toBe(false)
    expect(errorSpy).toHaveBeenCalled()

    errorSpy.mockRestore()
  })

  it('trims and saves a blocked domain, then reloads the blocklist', async () => {
    fetchAdminAnalytics.mockResolvedValue(ANALYTICS)
    fetchBlocklist.mockResolvedValue(BLOCKLIST)
    addBlockedDomain.mockResolvedValue(undefined)

    const { result } = renderHook(() => useAdminOperations(true))
    await waitFor(() => expect(result.current.isBlocklistLoading).toBe(false))

    let saved = false
    await act(async () => {
      saved = await result.current.addDomain('  spam.example  ', '  reported  ')
    })

    expect(saved).toBe(true)
    expect(addBlockedDomain).toHaveBeenCalledWith('spam.example', 'reported')
    expect(fetchBlocklist).toHaveBeenCalledTimes(2)
    expect(result.current.blocklistBusy).toBeNull()
  })

  it('explains a rejected domain and a transient blocklist failure', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fetchAdminAnalytics.mockResolvedValue(ANALYTICS)
    fetchBlocklist.mockResolvedValue(BLOCKLIST)
    addBlockedDomain.mockRejectedValueOnce(new AdminApiError(400))

    const { result } = renderHook(() => useAdminOperations(true))
    await waitFor(() => expect(result.current.isBlocklistLoading).toBe(false))

    await act(async () => {
      await result.current.addDomain('not a domain', '')
    })
    expect(result.current.blocklistError).toMatch(/domain format/i)

    addBlockedDomain.mockRejectedValueOnce(new AdminApiError(500))
    await act(async () => {
      await result.current.addDomain('spam.example', '')
    })
    expect(result.current.blocklistError).toMatch(/could not be blocked right now/i)

    removeBlockedDomain.mockRejectedValueOnce(new AdminApiError(500))
    await act(async () => {
      await result.current.removeDomain('spam.example')
    })
    expect(result.current.blocklistError).toMatch(/could not be unblocked/i)

    errorSpy.mockRestore()
  })

  it('unblocks a domain and reloads the blocklist', async () => {
    fetchAdminAnalytics.mockResolvedValue(ANALYTICS)
    fetchBlocklist.mockResolvedValue({ domains: [], entries: [] } as never)
    removeBlockedDomain.mockResolvedValue(undefined)

    const { result } = renderHook(() => useAdminOperations(true))
    await waitFor(() => expect(result.current.isBlocklistLoading).toBe(false))

    let removed = false
    await act(async () => {
      removed = await result.current.removeDomain('spam.example')
    })

    expect(removed).toBe(true)
    expect(removeBlockedDomain).toHaveBeenCalledWith('spam.example')
    expect(result.current.blocklistBusy).toBeNull()
    expect(result.current.blocklist).toEqual({ domains: [], entries: [] })
  })

  it('runs a KV sync and refreshes analytics afterwards', async () => {
    fetchAdminAnalytics.mockResolvedValue(ANALYTICS)
    fetchBlocklist.mockResolvedValue(BLOCKLIST)
    syncAdminKv.mockResolvedValue(SYNC_RESULT)

    const { result } = renderHook(() => useAdminOperations(true))
    await waitFor(() => expect(result.current.isAnalyticsLoading).toBe(false))

    await act(async () => {
      await result.current.syncKv()
    })

    expect(syncAdminKv).toHaveBeenCalledOnce()
    expect(result.current.kvResult).toEqual(SYNC_RESULT)
    expect(result.current.kvError).toBeNull()
    expect(result.current.isSyncingKv).toBe(false)
    expect(fetchAdminAnalytics).toHaveBeenCalledTimes(2)
  })

  it('reports a failed KV sync and clears the busy flag', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fetchAdminAnalytics.mockResolvedValue(ANALYTICS)
    fetchBlocklist.mockResolvedValue(BLOCKLIST)
    syncAdminKv.mockRejectedValue(new Error('sync failed'))

    const { result } = renderHook(() => useAdminOperations(true))
    await waitFor(() => expect(result.current.isAnalyticsLoading).toBe(false))

    await act(async () => {
      await result.current.syncKv()
    })

    expect(result.current.kvError).toMatch(/key-value sync could not be completed/i)
    expect(result.current.kvResult).toBeNull()
    expect(result.current.isSyncingKv).toBe(false)
    expect(errorSpy).toHaveBeenCalled()

    errorSpy.mockRestore()
  })

  it('refreshes both panels without toggling the busy state', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fetchAdminAnalytics
      .mockResolvedValueOnce(ANALYTICS)
      .mockRejectedValueOnce(new Error('refresh failed'))
    fetchBlocklist.mockResolvedValue(BLOCKLIST)

    const { result } = renderHook(() => useAdminOperations(true))
    await waitFor(() => expect(result.current.isAnalyticsLoading).toBe(false))

    await act(async () => {
      await result.current.refresh()
    })

    expect(fetchAdminAnalytics).toHaveBeenCalledTimes(2)
    expect(fetchBlocklist).toHaveBeenCalledTimes(2)
    expect(result.current.analytics).toEqual(ANALYTICS)
    expect(errorSpy).toHaveBeenCalled()

    errorSpy.mockRestore()
  })
})
