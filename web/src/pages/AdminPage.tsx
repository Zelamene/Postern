import { useCallback, useEffect, useRef, useState } from 'react'
import type { InviteDashboard, InviteRequest, ThemeMode } from '../types'
import { AdminAnalyticsBoard } from '../components/admin/AdminAnalyticsBoard'
import { AdminAuthPanel } from '../components/admin/AdminAuthPanel'
import { AdminBlocklistPanel } from '../components/admin/AdminBlocklistPanel'
import { AdminHeader } from '../components/admin/AdminHeader'
import { AdminInviteDashboard } from '../components/admin/AdminInviteDashboard'
import { AppFooter } from '../components/app/AppFooter'
import { AdminKvSyncPanel } from '../components/admin/AdminKvSyncPanel'
import { useAdminOperations } from '../hooks/useAdminOperations'
import { useAdminRealtime } from '../hooks/useAdminRealtime'
import { useNotifications } from '../hooks/useNotifications'
import {
  AdminApiError,
  approveInviteRequest,
  getDashboardData,
  rejectInviteRequest,
  resendInvite,
  revokeInvite,
  signOutAdmin,
} from '../services/adminService'

interface AdminPageProps {
  theme: ThemeMode
  onThemeChange: (theme: ThemeMode) => void
}

type AccessState = 'checking' | 'signedOut' | 'dashboard' | 'forbidden' | 'unavailable'

export function AdminPage({ theme, onThemeChange }: Readonly<AdminPageProps>) {
  const [access, setAccess] = useState<AccessState>('checking')
  const [dashboard, setDashboard] = useState<InviteDashboard | null>(null)
  const [requests, setRequests] = useState<InviteRequest[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const mounted = useRef(true)

  const {
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
    reload: reloadOperations,
    refresh: refreshOperations,
    addDomain,
    removeDomain,
    syncKv,
  } = useAdminOperations(access === 'dashboard')
  const notifications = useNotifications(access === 'dashboard', 'admin')

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const applyDashboardError = useCallback((error: unknown) => {
    if (error instanceof AdminApiError) {
      if (error.status === 401) {
        setAccess('signedOut')
        return
      }
      if (error.status === 403) {
        setAccess('forbidden')
        return
      }

      setLoadError('The admin dashboard could not be loaded. Please try again.')
      setAccess((current) => (current === 'checking' ? 'unavailable' : current))
      return
    }

    console.error('Admin dashboard request failed', error)
    setLoadError('The admin dashboard could not be reached. Check the API connection and try again.')
    setAccess((current) => (current === 'checking' ? 'unavailable' : current))
  }, [])

  const applyDashboard = useCallback(
    (nextDashboard: InviteDashboard, nextRequests: InviteRequest[]) => {
      setDashboard(nextDashboard)
      setRequests(nextRequests)
      setLoadError(null)
      setAccess('dashboard')
    },
    [],
  )

  const refreshDashboard = useCallback(async () => {
    try {
      const [nextDashboard, nextRequests] = await getDashboardData()
      if (!mounted.current) {
        return
      }
      applyDashboard(nextDashboard, nextRequests)
    } catch (error) {
      if (mounted.current) {
        applyDashboardError(error)
      }
    } finally {
      if (mounted.current) {
        setIsLoading(false)
      }
    }
  }, [applyDashboard, applyDashboardError])

  useAdminRealtime(access === 'dashboard', {
    onDashboardChanged: async () => {
      await refreshDashboard()
      await notifications.refresh()
    },
    onOperationsChanged: async () => {
      await refreshOperations()
      await notifications.refresh()
    },
  })

  useEffect(() => {
    let active = true

    getDashboardData()
      .then(([nextDashboard, nextRequests]) => {
        if (active) {
          applyDashboard(nextDashboard, nextRequests)
        }
      })
      .catch((error: unknown) => {
        if (active) {
          applyDashboardError(error)
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [applyDashboard, applyDashboardError])

  const handleAuthenticated = useCallback(
    async (nextRecoveryKey: string | null) => {
      setRecoveryKey(nextRecoveryKey)
      await refreshDashboard()
    },
    [refreshDashboard],
  )

  const handleLogout = useCallback(async () => {
    try {
      await signOutAdmin()
    } catch (error) {
      if (!(error instanceof AdminApiError && error.status === 401)) {
        console.error('Admin sign-out failed', error)
        setActionError('Could not reach the server to sign out. Please try again.')
        return
      }
    }

    setDashboard(null)
    setRequests([])
    setRecoveryKey(null)
    setActionError(null)
    setLoadError(null)
    setAccess('signedOut')
  }, [])

  const runAction = useCallback(
    async (actionId: string, action: () => Promise<void>) => {
      setBusyAction(actionId)
      setActionError(null)
      try {
        await action()
        await refreshDashboard()
        await reloadOperations()
      } catch (error) {
        if (error instanceof AdminApiError && error.status === 401) {
          setAccess('signedOut')
          return
        }
        if (error instanceof AdminApiError && error.status === 403) {
          setAccess('forbidden')
          return
        }

        console.error('Admin invite action failed', error)
        setActionError('That action could not be completed. Refresh the dashboard and try again.')
      } finally {
        setBusyAction(null)
      }
    },
    [refreshDashboard, reloadOperations],
  )

  const handleRefresh = useCallback(async () => {
    setIsLoading(true)
    await refreshDashboard()
    await reloadOperations()
  }, [refreshDashboard, reloadOperations])

  return (
    <div className="ea-root">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[var(--z-toast)] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-on-inverse focus:shadow-md"
      >
        Skip to main content
      </a>

      <AdminHeader
        theme={theme}
        isSignedIn={access === 'dashboard'}
        notifications={notifications}
        onThemeChange={onThemeChange}
        onSignOut={() => void handleLogout()}
      />

      <main id="admin-main" className="ea-main ea-main--admin">
        {access === 'checking' && (
          <div className="ea-state-main" role="status" aria-live="polite">
            <div className="ea-card ea-card__pad flex w-full max-w-sm flex-col items-center gap-3 text-center">
              <span className="spinner" aria-hidden="true" />
              <p className="ea-hint">Checking admin session</p>
            </div>
          </div>
        )}

        {(access === 'signedOut' || access === 'unavailable' || access === 'forbidden') && (
          <div className="ea-state-main">
            <AdminAuthPanel
              mode={access === 'forbidden' ? 'forbidden' : access}
              sessionError={access === 'forbidden' ? null : loadError}
              onAuthenticated={handleAuthenticated}
              onSignOut={() => void handleLogout()}
            />
          </div>
        )}

        {access === 'dashboard' && dashboard && (
          <div className="ea-admin-stack">
            <AdminInviteDashboard
              dashboard={dashboard}
              requests={requests}
              busyAction={busyAction}
              actionError={actionError}
              loadError={loadError}
              isLoading={isLoading}
              recoveryKey={recoveryKey}
              onDismissRecoveryKey={() => setRecoveryKey(null)}
              onRefresh={() => void handleRefresh()}
              onApprove={(requestId) =>
                void runAction(`approve-${requestId}`, () => approveInviteRequest(requestId))
              }
              onReject={(requestId) =>
                void runAction(`reject-${requestId}`, () => rejectInviteRequest(requestId))
              }
              onResend={(inviteId) =>
                void runAction(`resend-${inviteId}`, () => resendInvite(inviteId))
              }
              onRevoke={(inviteId) =>
                void runAction(`revoke-${inviteId}`, () => revokeInvite(inviteId))
              }
            />

            <AdminAnalyticsBoard
              analytics={analytics}
              error={analyticsError}
              isLoading={isAnalyticsLoading}
              windowHours={windowHours}
              onWindowHoursChange={setWindowHours}
              onReload={() => void reloadOperations()}
            />

            <div className="ea-admin-split">
              <AdminBlocklistPanel
                entries={blocklist?.entries ?? []}
                isLoading={isBlocklistLoading}
                error={blocklistError}
                busyDomain={blocklistBusy}
                onAdd={addDomain}
                onRemove={removeDomain}
                onReload={() => void reloadOperations()}
              />
              <AdminKvSyncPanel
                dirtyAliases={analytics?.totals.kvDirtyAliases ?? null}
                result={kvResult}
                error={kvError}
                isSyncing={isSyncingKv}
                onSync={() => void syncKv()}
              />
            </div>
          </div>
        )}
      </main>

      <AppFooter />
    </div>
  )
}
