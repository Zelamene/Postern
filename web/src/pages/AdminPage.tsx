import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { ThemeMode } from '../components/common/Navbar'
import { IconMoon, IconPosternLogo, IconSun } from '../components/common/Icons'
import { ConfirmationDialog } from '../components/common/ConfirmationDialog'
import { RecoveryKeyNotice } from '../components/common/RecoveryKeyNotice'
import { TotpQrCode } from '../components/common/TotpQrCode'
import { useAdminRealtime } from '../hooks/useAdminRealtime'

interface AdminPageProps {
  theme: ThemeMode
  onThemeChange: (theme: ThemeMode) => void
}

interface AdminInvite {
  id: string
  email: string
  status: string
  createdAt: string
  expiresAt: string | null
  canResend: boolean
  canRevoke: boolean
}

interface InviteDashboard {
  invites: AdminInvite[]
  seatsFree: number
  outstandingInvites: number
}

interface InviteRequest {
  id: string
  email: string
  requestedAt: string
}

interface AdminTotpSetup {
  secret: string
  authenticatorUri: string
}

class AdminApiError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Admin API returned ${status}.`)
    this.name = 'AdminApiError'
    this.status = status
  }
}

type AccessState = 'checking' | 'signedOut' | 'dashboard' | 'forbidden' | 'unavailable'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

function apiError(status: number): AdminApiError {
  return new AdminApiError(status)
}

async function getDashboardData(): Promise<[InviteDashboard, InviteRequest[]]> {
  const [invitesResponse, requestsResponse] = await Promise.all([
    fetch('/api/admin/invites', { credentials: 'include', cache: 'no-store' }),
    fetch('/api/admin/invite-requests', { credentials: 'include', cache: 'no-store' }),
  ])
  if (!invitesResponse.ok) {
    throw apiError(invitesResponse.status)
  }
  if (!requestsResponse.ok) {
    throw apiError(requestsResponse.status)
  }
  const dashboard = (await invitesResponse.json()) as InviteDashboard
  const requests = (await requestsResponse.json()) as { requests: InviteRequest[] }
  return [dashboard, requests.requests]
}

function statusStyle(status: string): string {
  switch (status) {
    case 'delivered':
    case 'accepted':
      return 'bg-success-surface text-success-on-surface'
    case 'sent':
      return 'bg-info-surface text-info-on-surface'
    case 'bounced':
    case 'complained':
    case 'failed':
      return 'bg-danger-surface text-danger-on-surface'
    case 'pending':
      return 'bg-warning-surface text-warning-on-surface'
    default:
      return 'bg-surface-sunken text-text-muted'
  }
}

function formatDate(value: string | null): string {
  if (!value) {
    return 'No expiry'
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
}

export function AdminPage({ theme, onThemeChange }: Readonly<AdminPageProps>) {
  const [access, setAccess] = useState<AccessState>('checking')
  const [dashboard, setDashboard] = useState<InviteDashboard | null>(null)
  const [requests, setRequests] = useState<InviteRequest[]>([])
  const [requestToReject, setRequestToReject] = useState<InviteRequest | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [mfaStep, setMfaStep] = useState<'setup' | 'verify' | null>(null)
  const [mfaSetup, setMfaSetup] = useState<AdminTotpSetup | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)

  const refreshDashboard = useCallback(async () => {
    try {
      const [nextDashboard, nextRequests] = await getDashboardData()
      setDashboard(nextDashboard)
      setRequests(nextRequests)
      setLoadError(null)
      setAccess('dashboard')
    } catch (error) {
      if (error instanceof AdminApiError) {
        if (error.status === 401) {
          setAccess('signedOut')
        } else if (error.status === 403) {
          setAccess('forbidden')
        } else {
          setLoadError('The admin dashboard could not be loaded. Please try again.')
          setAccess((current) => current === 'checking' ? 'unavailable' : current)
        }
      } else {
        console.error('Admin dashboard request failed', error)
        setLoadError('The admin dashboard could not be reached. Check the API connection and try again.')
        setAccess((current) => current === 'checking' ? 'unavailable' : current)
      }
    } finally {
      setIsLoading(false)
    }
  }, [])
  useAdminRealtime(access === 'dashboard', refreshDashboard)

  useEffect(() => {
    let active = true

    async function checkAdminSession() {
      try {
        const [nextDashboard, nextRequests] = await getDashboardData()
        if (!active) {
          return
        }
        setDashboard(nextDashboard)
        setRequests(nextRequests)
        setLoadError(null)
        setAccess('dashboard')
      } catch (error) {
        if (!active) {
          return
        }
        if (error instanceof AdminApiError && error.status === 401) {
          setAccess('signedOut')
        } else if (error instanceof AdminApiError && error.status === 403) {
          setAccess('forbidden')
        } else {
          if (!(error instanceof AdminApiError)) {
            console.error('Admin session check failed', error)
            setLoadError('The admin dashboard could not be reached. Check the API connection and try again.')
          } else {
            setLoadError('The admin dashboard could not be loaded. Please try again.')
          }
          setAccess('unavailable')
        }
      } finally {
        if (active) {
          setIsLoading(false)
        }
      }
    }

    void checkAdminSession()
    return () => {
      active = false
    }
  }, [])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSigningIn(true)
    setLoginError(null)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: JSON_HEADERS,
        body: JSON.stringify({ email, password }),
      })
      if (response.status === 401) {
        setLoginError('Email or password is incorrect.')
        return
      }
      if (!response.ok) {
        setLoginError('Sign-in is unavailable right now. Please try again.')
        return
      }
      const result = (await response.json()) as {
        recoveryKey?: string | null
        mfaRequired?: boolean
        mfaSetupRequired?: boolean
      }
      setPassword('')
      setRecoveryKey(result.recoveryKey ?? null)
      if (result.mfaSetupRequired || result.mfaRequired) {
        setMfaStep(result.mfaSetupRequired ? 'setup' : 'verify')
        setLoginError(null)
        if (result.mfaSetupRequired) {
          const setupResponse = await fetch('/api/auth/admin-mfa/setup', {
            method: 'POST',
            credentials: 'include',
            cache: 'no-store',
          })
          if (!setupResponse.ok) {
            throw apiError(setupResponse.status)
          }
          setMfaSetup((await setupResponse.json()) as AdminTotpSetup)
        }
        return
      }
      await refreshDashboard()
    } catch (error) {
      console.error('Admin sign-in failed', error)
      setLoginError('Sign-in is unavailable right now. Check the API connection and try again.')
    } finally {
      setIsSigningIn(false)
    }
  }

  async function handleMfaSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSigningIn(true)
    setLoginError(null)
    try {
      const response = await fetch(
        mfaStep === 'setup'
          ? '/api/auth/admin-mfa/enable'
          : '/api/auth/admin-mfa/verify',
        {
          method: 'POST',
          credentials: 'include',
          headers: JSON_HEADERS,
          cache: 'no-store',
          body: JSON.stringify({ code: mfaCode }),
        },
      )
      if (!response.ok) {
        setLoginError(response.status === 401
          ? 'That code is invalid or expired. Check your authenticator and try again.'
          : 'Multi-factor sign-in is unavailable right now. Please try again.')
        return
      }

      setMfaStep(null)
      setMfaSetup(null)
      setMfaCode('')
      await refreshDashboard()
    } catch (error) {
      console.error('Admin multi-factor verification failed', error)
      setLoginError('Multi-factor sign-in is unavailable right now. Check the API connection and try again.')
    } finally {
      setIsSigningIn(false)
    }
  }

  async function handleLogout() {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      })
      if (!response.ok && response.status !== 401) {
        setActionError('Could not sign out. Please try again.')
        return
      }
    } catch (error) {
      console.error('Admin sign-out failed', error)
      setActionError('Could not reach the server to sign out. Please try again.')
      return
    }
    setDashboard(null)
    setRequests([])
    setRecoveryKey(null)
    setAccess('signedOut')
  }

  async function runAction(actionId: string, url: string, method: 'POST') {
    setBusyAction(actionId)
    setActionError(null)
    try {
      const response = await fetch(url, { method, credentials: 'include' })
      if (!response.ok) {
        if (response.status === 401) {
          setAccess('signedOut')
          return
        }
        if (response.status === 403) {
          setAccess('forbidden')
          return
        }
        throw apiError(response.status)
      }
      await refreshDashboard()
    } catch (error) {
      console.error('Admin invite action failed', error)
      setActionError('That action could not be completed. Refresh the dashboard and try again.')
    } finally {
      setBusyAction(null)
    }
  }

  const isDark = theme === 'dark'

  return (
    <div className="min-h-screen bg-bg text-text">
      <header className="border-b border-hairline/70 bg-surface">
        <div className="shell flex min-h-16 items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-2.5 text-text no-underline">
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-on-inverse">
              <IconPosternLogo size={20} />
            </span>
            <span className="text-lg font-extrabold tracking-tight">Postern</span>
            <span className="hidden border-l border-hairline pl-3 text-xs font-semibold uppercase tracking-[0.14em] text-text-muted sm:inline">
              Admin
            </span>
          </a>
          <div className="flex items-center gap-2">
            {access === 'dashboard' && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => void handleLogout()}
              >
                Sign out
              </button>
            )}
            <button
              type="button"
              onClick={() => onThemeChange(isDark ? 'light' : 'dark')}
              className="flex size-9 items-center justify-center rounded-full border border-hairline/80 bg-surface-sunken/60 text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
            </button>
          </div>
        </div>
      </header>

      <main className="shell py-10 md:py-14">
        {access === 'checking' && (
          <div className="flex min-h-64 items-center justify-center gap-3 text-text-muted" role="status">
            <span className="spinner" aria-hidden="true" />
            Checking admin session
          </div>
        )}

        {(access === 'signedOut' || access === 'unavailable') && (
          <section className="mx-auto max-w-md rounded-2xl border border-hairline bg-surface p-6 shadow-sm sm:p-8">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">Postern administration</p>
            <h1 className="text-3xl font-extrabold tracking-tight">
              {mfaStep === 'setup' ? 'Set up two-factor sign-in' : mfaStep === 'verify' ? 'Verify it’s you' : 'Admin sign in'}
            </h1>
            <p className="mt-2 text-sm text-text-muted">
              {mfaStep === 'setup'
                ? 'Add this account to an authenticator app. You will need a fresh code every time you sign in.'
                : mfaStep === 'verify'
                  ? 'Enter the current six-digit code from your authenticator app to finish signing in.'
                  : 'Sign in with the provisioned administrator account.'}
            </p>
            {(loginError || loadError) && (
              <p role="alert" className="mt-5 rounded-lg bg-danger-surface px-4 py-3 text-sm text-danger-on-surface">
                {loginError ?? loadError}
              </p>
            )}
            {mfaStep === 'setup' && mfaSetup && (
              <div className="mt-5 space-y-3 rounded-xl border border-hairline bg-surface-sunken/50 p-4">
                <p className="text-sm font-semibold">Add Postern to your authenticator app</p>
                <TotpQrCode authenticatorUri={mfaSetup.authenticatorUri} />
                <a
                  href={mfaSetup.authenticatorUri}
                  className="text-sm font-semibold"
                >
                  Open in an authenticator app
                </a>
                <p className="text-xs text-text-muted">Or enter this setup key manually:</p>
                <code className="block break-all rounded-lg bg-surface px-3 py-2 text-sm tracking-wider">
                  {mfaSetup.secret}
                </code>
              </div>
            )}
            {mfaStep ? (
              <form className="mt-6 space-y-4" onSubmit={handleMfaSubmit}>
                <div>
                  <label htmlFor="admin-mfa-code" className="mb-1 block text-sm font-semibold">
                    Authenticator code
                  </label>
                  <input
                    id="admin-mfa-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                    className="w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-center font-mono text-lg tracking-[0.3em] text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <button type="submit" className="btn btn--primary btn--lg w-full" disabled={isSigningIn}>
                  {isSigningIn ? 'Verifying…' : mfaStep === 'setup' ? 'Enable and continue' : 'Verify and sign in'}
                </button>
              </form>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={handleLogin}>
              <div>
                <label htmlFor="admin-email" className="mb-1 block text-sm font-semibold">Email address</label>
                <input
                  id="admin-email"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label htmlFor="admin-password" className="mb-1 block text-sm font-semibold">Password</label>
                <input
                  id="admin-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-lg border border-hairline bg-surface px-3 py-2.5 text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <button type="submit" className="btn btn--primary btn--lg w-full" disabled={isSigningIn}>
                {isSigningIn ? 'Signing in…' : 'Sign in'}
              </button>
              </form>
            )}
            {recoveryKey && <RecoveryKeyNotice recoveryKey={recoveryKey} className="mt-5" />}
            <a href="/" className="mt-5 inline-block text-sm font-semibold no-underline">Back to Postern</a>
          </section>
        )}

        {access === 'forbidden' && (
          <section className="mx-auto max-w-lg rounded-2xl border border-hairline bg-surface p-8 text-center shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Restricted area</p>
            <h1 className="mt-2 text-3xl font-extrabold">Admin access required</h1>
            <p className="mt-3 text-sm text-text-muted">This account is not permitted to manage Postern invitations.</p>
            <button type="button" className="btn btn--primary mt-6" onClick={() => void handleLogout()}>
              Sign out
            </button>
          </section>
        )}

        {access === 'dashboard' && dashboard && (
          <div className="space-y-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-primary">Invitation management</p>
                <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Admin dashboard</h1>
                <p className="mt-2 text-sm text-text-muted">Review invite requests and manage delivery from one place.</p>
              </div>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  setIsLoading(true)
                  void refreshDashboard()
                }}
                disabled={isLoading}
              >
                {isLoading ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>

            {recoveryKey && (
              <RecoveryKeyNotice
                recoveryKey={recoveryKey}
                onDismiss={() => setRecoveryKey(null)}
                className="p-5"
              />
            )}

            {loadError && <p role="alert" className="rounded-lg bg-danger-surface px-4 py-3 text-sm text-danger-on-surface">{loadError}</p>}
            {actionError && <p role="alert" className="rounded-lg bg-danger-surface px-4 py-3 text-sm text-danger-on-surface">{actionError}</p>}

            <section aria-label="Invitation capacity" className="grid gap-4 sm:grid-cols-2">
              <article className="rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
                <p className="text-sm font-semibold text-text-muted">Seats free</p>
                <p className="mt-2 text-4xl font-extrabold tracking-tight text-primary">{dashboard.seatsFree}</p>
                <p className="mt-1 text-xs text-text-muted">Available after registered users and outstanding invites</p>
              </article>
              <article className="rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
                <p className="text-sm font-semibold text-text-muted">Outstanding invites</p>
                <p className="mt-2 text-4xl font-extrabold tracking-tight">{dashboard.outstandingInvites}</p>
                <p className="mt-1 text-xs text-text-muted">Unused invitations that have not expired or been revoked</p>
              </article>
            </section>

            <section className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm">
              <div className="border-b border-hairline px-5 py-4 sm:px-6">
                <h2 className="text-xl font-bold">Invite requests</h2>
                <p className="mt-1 text-sm text-text-muted">Approve a request to issue an invitation, or reject it.</p>
              </div>
              {requests.length === 0 ? (
                <p className="px-5 py-8 text-sm text-text-muted sm:px-6">No pending invite requests.</p>
              ) : (
                <ul className="divide-y divide-hairline">
                  {requests.map((request) => (
                    <li key={request.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                      <div className="min-w-0">
                        <p className="break-all font-semibold">{request.email}</p>
                        <p className="mt-1 text-xs text-text-muted">Requested {formatDate(request.requestedAt)}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          className="btn btn--primary btn--sm"
                          disabled={busyAction !== null}
                          onClick={() => void runAction(`approve-${request.id}`, `/api/admin/invite-requests/${request.id}/approve`, 'POST')}
                        >
                          {busyAction === `approve-${request.id}` ? 'Approving…' : 'Approve'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger btn--sm"
                          disabled={busyAction !== null}
                          onClick={() => setRequestToReject(request)}
                        >
                          Reject
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm">
              <div className="border-b border-hairline px-5 py-4 sm:px-6">
                <h2 className="text-xl font-bold">All invites</h2>
                <p className="mt-1 text-sm text-text-muted">Delivery state, expiry, and available actions for each invitation.</p>
              </div>
              {dashboard.invites.length === 0 ? (
                <p className="px-5 py-8 text-sm text-text-muted sm:px-6">No invitations have been issued yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[42rem] text-left text-sm">
                    <thead className="bg-surface-sunken text-xs uppercase tracking-wide text-text-muted">
                      <tr>
                        <th scope="col" className="px-5 py-3 font-semibold sm:px-6">Recipient</th>
                        <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                        <th scope="col" className="px-4 py-3 font-semibold">Expires</th>
                        <th scope="col" className="px-5 py-3 text-right font-semibold sm:px-6">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-hairline">
                      {dashboard.invites.map((invite) => (
                        <tr key={invite.id}>
                          <td className="break-all px-5 py-4 font-medium sm:px-6">{invite.email}</td>
                          <td className="px-4 py-4">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusStyle(invite.status)}`}>
                              {invite.status}
                            </span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-text-muted">{formatDate(invite.expiresAt)}</td>
                          <td className="px-5 py-4 sm:px-6">
                            <div className="flex justify-end gap-2">
                              {invite.canResend && (
                                <button
                                  type="button"
                                  className="btn btn--secondary btn--sm"
                                  disabled={busyAction !== null}
                                  onClick={() => void runAction(`resend-${invite.id}`, `/api/admin/invites/${invite.id}/resend`, 'POST')}
                                >
                                  {busyAction === `resend-${invite.id}` ? 'Resending…' : 'Resend'}
                                </button>
                              )}
                              {invite.canRevoke && (
                                <button
                                  type="button"
                                  className="btn btn--danger btn--sm"
                                  disabled={busyAction !== null}
                                  onClick={() => {
                                    if (window.confirm(`Revoke the invite for ${invite.email}?`)) {
                                      void runAction(`revoke-${invite.id}`, `/api/admin/invites/${invite.id}/revoke`, 'POST')
                                    }
                                  }}
                                >
                                  {busyAction === `revoke-${invite.id}` ? 'Revoking…' : 'Revoke'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
      <ConfirmationDialog
        open={requestToReject !== null}
        title="Reject this invite request?"
        description={
          requestToReject
            ? `Reject the request from ${requestToReject.email}? It will be removed from pending review, and this action cannot be undone.`
            : ''
        }
        confirmLabel="Reject invite request"
        busy={requestToReject !== null && busyAction === `reject-${requestToReject.id}`}
        onCancel={() => setRequestToReject(null)}
        onConfirm={() => {
          if (!requestToReject) {
            return
          }

          const rejectedRequest = requestToReject
          setRequestToReject(null)
          void runAction(
            `reject-${rejectedRequest.id}`,
            `/api/admin/invite-requests/${rejectedRequest.id}/reject`,
            'POST',
          )
        }}
      />
    </div>
  )
}
