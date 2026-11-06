import { useCallback, useEffect, useState } from 'react'
import {
  addBlockedDomain,
  AdminApiError,
  fetchAdminAnalytics,
  fetchBlocklist,
  removeBlockedDomain,
  syncAdminKv,
} from '../services/adminService'
import type {
  AdminAnalytics,
  AdminOperations,
  Blocklist,
  KvSyncResult,
} from '../types'

const DEFAULT_WINDOW_HOURS = 24

export function useAdminOperations(enabled: boolean): AdminOperations {
  const [windowHours, setWindowHoursState] = useState(DEFAULT_WINDOW_HOURS)
  const [activeRequest, setActiveRequest] = useState(
    () => `${enabled}:${DEFAULT_WINDOW_HOURS}`,
  )
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null)
  const [analyticsError, setAnalyticsError] = useState<string | null>(null)
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(false)
  const [blocklist, setBlocklist] = useState<Blocklist | null>(null)
  const [blocklistError, setBlocklistError] = useState<string | null>(null)
  const [isBlocklistLoading, setIsBlocklistLoading] = useState(false)
  const [blocklistBusy, setBlocklistBusy] = useState<string | null>(null)
  const [kvResult, setKvResult] = useState<KvSyncResult | null>(null)
  const [kvError, setKvError] = useState<string | null>(null)
  const [isSyncingKv, setIsSyncingKv] = useState(false)

  const requestKey = `${enabled}:${windowHours}`
  if (activeRequest !== requestKey) {
    setActiveRequest(requestKey)
    if (enabled) {
      setIsAnalyticsLoading(true)
      setIsBlocklistLoading(true)
      setAnalyticsError(null)
      setBlocklistError(null)
    }
  }

  const setWindowHours = useCallback((hours: number) => {
    setWindowHoursState(hours)
  }, [])

  const loadAnalytics = useCallback(async (hours: number) => {
    try {
      const next = await fetchAdminAnalytics(hours)
      setAnalytics(next)
      setAnalyticsError(null)
    } catch (error) {
      console.error('Admin analytics request failed', error)
      setAnalyticsError('Analytics could not be loaded right now. Please try again.')
    } finally {
      setIsAnalyticsLoading(false)
    }
  }, [])

  const loadBlocklist = useCallback(async () => {
    try {
      const next = await fetchBlocklist()
      setBlocklist(next)
      setBlocklistError(null)
    } catch (error) {
      console.error('Admin blocklist request failed', error)
      setBlocklistError('The global blocklist could not be loaded right now. Please try again.')
    } finally {
      setIsBlocklistLoading(false)
    }
  }, [])

  const reload = useCallback(async () => {
    setIsAnalyticsLoading(true)
    setIsBlocklistLoading(true)
    await Promise.all([loadAnalytics(windowHours), loadBlocklist()])
  }, [loadAnalytics, loadBlocklist, windowHours])

  const refresh = useCallback(async () => {
    if (!enabled) {
      return
    }

    const [analyticsResult, blocklistResult] = await Promise.allSettled([
      fetchAdminAnalytics(windowHours),
      fetchBlocklist(),
    ])

    if (analyticsResult.status === 'fulfilled') {
      setAnalytics(analyticsResult.value)
      setAnalyticsError(null)
    } else {
      console.error('Admin analytics refresh failed', analyticsResult.reason)
    }

    if (blocklistResult.status === 'fulfilled') {
      setBlocklist(blocklistResult.value)
      setBlocklistError(null)
    } else {
      console.error('Admin blocklist refresh failed', blocklistResult.reason)
    }
  }, [enabled, windowHours])

  useEffect(() => {
    if (!enabled) {
      return
    }

    let active = true

    fetchAdminAnalytics(windowHours)
      .then((next) => {
        if (active) {
          setAnalytics(next)
          setAnalyticsError(null)
        }
      })
      .catch((error: unknown) => {
        if (active) {
          console.error('Admin analytics request failed', error)
          setAnalyticsError('Analytics could not be loaded right now. Please try again.')
        }
      })
      .finally(() => {
        if (active) {
          setIsAnalyticsLoading(false)
        }
      })

    fetchBlocklist()
      .then((next) => {
        if (active) {
          setBlocklist(next)
          setBlocklistError(null)
        }
      })
      .catch((error: unknown) => {
        if (active) {
          console.error('Admin blocklist request failed', error)
          setBlocklistError('The global blocklist could not be loaded right now. Please try again.')
        }
      })
      .finally(() => {
        if (active) {
          setIsBlocklistLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [enabled, windowHours])

  const addDomain = useCallback(
    async (domain: string, reason: string): Promise<boolean> => {
      setBlocklistBusy('add')
      setBlocklistError(null)
      try {
        await addBlockedDomain(domain.trim(), reason.trim())
        await reload()
        return true
      } catch (error) {
        console.error('Admin blocklist add failed', error)
        setBlocklistError(
          error instanceof AdminApiError && error.status === 400
            ? 'That domain could not be blocked. Check the domain format and try again.'
            : 'The domain could not be blocked right now. Please try again.',
        )
        return false
      } finally {
        setBlocklistBusy(null)
      }
    },
    [reload],
  )

  const removeDomain = useCallback(
    async (domain: string): Promise<boolean> => {
      setBlocklistBusy(domain)
      setBlocklistError(null)
      try {
        await removeBlockedDomain(domain)
        await reload()
        return true
      } catch (error) {
        console.error('Admin blocklist removal failed', error)
        setBlocklistError('The domain could not be unblocked right now. Please try again.')
        return false
      } finally {
        setBlocklistBusy(null)
      }
    },
    [reload],
  )

  const syncKv = useCallback(async () => {
    setIsSyncingKv(true)
    setKvError(null)
    setKvResult(null)
    try {
      const result = await syncAdminKv()
      setKvResult(result)
      setIsAnalyticsLoading(true)
      await loadAnalytics(windowHours)
    } catch (error) {
      console.error('Admin KV sync failed', error)
      setKvError('The key-value sync could not be completed. Try again in a moment.')
    } finally {
      setIsSyncingKv(false)
    }
  }, [loadAnalytics, windowHours])

  return {
    windowHours,
    setWindowHours,
    analytics,
    analyticsError,
    isAnalyticsLoading,
    blocklist,
    blocklistError,
    isBlocklistLoading,
    blocklistBusy,
    kvResult,
    kvError,
    isSyncingKv,
    reload,
    refresh,
    addDomain,
    removeDomain,
    syncKv,
  }
}
