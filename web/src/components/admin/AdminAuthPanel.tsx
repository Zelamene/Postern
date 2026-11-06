import { useState, type FormEvent } from 'react'
import { RecoveryKeyNotice } from '../common/RecoveryKeyNotice'
import { TotpQrCode } from '../common/TotpQrCode'
import {
  AdminApiError,
  enableAdminTotp,
  signInAdmin,
  startAdminTotpSetup,
  verifyAdminTotp,
} from '../../services/adminService'
import type { AdminTotpSetup } from '../../types'

type AuthMode = 'signedOut' | 'unavailable' | 'forbidden'
type MfaStep = 'setup' | 'verify' | null

interface AdminAuthPanelProps {
  mode: AuthMode
  sessionError: string | null
  onAuthenticated: (recoveryKey: string | null) => Promise<void>
  onSignOut: () => void
}

export function AdminAuthPanel({
  mode,
  sessionError,
  onAuthenticated,
  onSignOut,
}: Readonly<AdminAuthPanelProps>) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState<string | null>(null)
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)
  const [mfaStep, setMfaStep] = useState<MfaStep>(null)
  const [mfaSetup, setMfaSetup] = useState<AdminTotpSetup | null>(null)
  const [mfaCode, setMfaCode] = useState('')
  const [isSigningIn, setIsSigningIn] = useState(false)

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSigningIn(true)
    setLoginError(null)

    try {
      const result = await signInAdmin(email, password)
      setPassword('')
      setRecoveryKey(result.recoveryKey ?? null)

      if (result.mfaSetupRequired || result.mfaRequired) {
        setMfaStep(result.mfaSetupRequired ? 'setup' : 'verify')
        if (result.mfaSetupRequired) {
          const setup = await startAdminTotpSetup()
          setMfaSetup(setup)
        }
        return
      }

      await onAuthenticated(result.recoveryKey ?? null)
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) {
        setLoginError('Email or password is incorrect.')
        return
      }

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
      if (mfaStep === 'setup') {
        await enableAdminTotp(mfaCode)
      } else {
        await verifyAdminTotp(mfaCode)
      }

      setMfaStep(null)
      setMfaSetup(null)
      setMfaCode('')
      await onAuthenticated(recoveryKey)
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 401) {
        setLoginError('That code is invalid or expired. Check your authenticator and try again.')
        return
      }

      console.error('Admin multi-factor verification failed', error)
      setLoginError('Multi-factor sign-in is unavailable right now. Check the API connection and try again.')
    } finally {
      setIsSigningIn(false)
    }
  }

  if (mode === 'forbidden') {
    return (
      <section className="mx-auto max-w-lg rounded-2xl border border-hairline bg-surface p-8 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-link">Restricted area</p>
        <h1 className="mt-2 text-3xl font-extrabold">Admin access required</h1>
        <p className="mt-3 text-sm text-text-muted">
          This account is not permitted to manage Postern invitations.
        </p>
        <button type="button" className="btn btn--primary mt-6" onClick={onSignOut}>
          Sign out
        </button>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-md rounded-2xl border border-hairline bg-surface p-6 shadow-sm sm:p-8">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-link">
        Postern administration
      </p>
      <h1 className="text-3xl font-extrabold tracking-tight">
        {mfaStep === 'setup'
          ? 'Set up two-factor sign-in'
          : mfaStep === 'verify'
            ? 'Verify it’s you'
            : 'Admin sign in'}
      </h1>
      <p className="mt-2 text-sm text-text-muted">
        {mfaStep === 'setup'
          ? 'Add this account to an authenticator app. You will need a fresh code every time you sign in.'
          : mfaStep === 'verify'
            ? 'Enter the current six-digit code from your authenticator app to finish signing in.'
            : 'Sign in with the provisioned administrator account.'}
      </p>
      {(loginError || sessionError) && (
        <p role="alert" className="mt-5 rounded-lg bg-danger-surface px-4 py-3 text-sm text-danger-on-surface">
          {loginError ?? sessionError}
        </p>
      )}
      {mfaStep === 'setup' && mfaSetup && (
        <div className="mt-5 space-y-3 rounded-xl border border-hairline bg-surface-sunken/50 p-4">
          <p className="text-sm font-semibold">Add Postern to your authenticator app</p>
          <TotpQrCode authenticatorUri={mfaSetup.authenticatorUri} />
          <a href={mfaSetup.authenticatorUri} className="text-sm font-semibold">
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
            <label htmlFor="admin-email" className="mb-1 block text-sm font-semibold">
              Email address
            </label>
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
            <label htmlFor="admin-password" className="mb-1 block text-sm font-semibold">
              Password
            </label>
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
      <a href="/" className="mt-5 inline-block text-sm font-semibold no-underline">
        Back to Postern
      </a>
    </section>
  )
}
