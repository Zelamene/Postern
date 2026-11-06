import { useCallback, useEffect, useRef, useState } from 'react'
import type { ThemeMode } from '../components/common/Navbar'
import { AdminAnalyticsBoard } from '../components/admin/AdminAnalyticsBoard'
import { AdminAuthPanel } from '../components/admin/AdminAuthPanel'
import { AdminBlocklistPanel } from '../components/admin/AdminBlocklistPanel'
import { AdminHeader } from '../components/admin/AdminHeader'
import { AdminInviteDashboard } from '../components/admin/AdminInviteDashboard'
import { AdminKvSyncPanel } from '../components/admin/AdminKvSyncPanel'
import { useAdminOperations } from '../hooks/useAdminOperations'
import { useAdminRealtime } from '../hooks/useAdminRealtime'
import {
  AdminApiError,
  approveInviteRequest,
  getDashboardData,
  rejectInviteRequest,
  resendInvite,
  revokeInvite,
  signOutAdmin,
  type InviteDashboard,
  type InviteRequest,
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
    addDomain,
    removeDomain,
    syncKv,
  } = useAdminOperations(access === 'dashboard')

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

  useAdminRealtime(access === 'dashboard', refreshDashboard)

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
    <div className="min-h-screen bg-bg text-text">
      <AdminHeader
        theme={theme}
        isSignedIn={access === 'dashboard'}
        onThemeChange={onThemeChange}
        onSignOut={() => void handleLogout()}
      />

      <main className="shell py-10 md:py-14">
        {access === 'checking' && (
          <div className="flex min-h-64 items-center justify-center gap-3 text-text-muted" role="status">
            <span className="spinner" aria-hidden="true" />
            Checking admin session
          </div>
        )}

        {(access === 'signedOut' || access === 'unavailable') && (
          <AdminAuthPanel
            mode={access}
            sessionError={loadError}
            onAuthenticated={handleAuthenticated}
            onSignOut={() => void handleLogout()}
          />
        )}

        {access === 'forbidden' && (
          <AdminAuthPanel
            mode="forbidden"
            sessionError={null}
            onAuthenticated={handleAuthenticated}
            onSignOut={() => void handleLogout()}
          />
        )}

        {access === 'dashboard' && dashboard && (
          <div className="space-y-10">
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

            <div className="grid gap-5 xl:grid-cols-2">
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
    </div>
  )
}
