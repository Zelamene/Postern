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
      <section className="ea-card ea-card__pad w-full max-w-md text-center">
        <h1 className="ea-title ea-title--sm">Admin access required</h1>
        <p className="ea-lede">
          This account is not permitted to manage Postern invitations.
        </p>
        <div className="ea-card__foot">
          <button type="button" className="btn btn--primary" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="ea-card ea-card__pad w-full max-w-md">
      <h1 className="ea-title ea-title--sm">
        {mfaStep === 'setup'
          ? 'Set up two-factor sign-in'
          : mfaStep === 'verify'
            ? 'Verify it’s you'
            : 'Admin sign in'}
      </h1>
      <p className="ea-lede">
        {mfaStep === 'setup'
          ? 'Add this account to an authenticator app. You will need a fresh code every time you sign in.'
          : mfaStep === 'verify'
            ? 'Enter the current six-digit code from your authenticator app to finish signing in.'
            : 'Sign in with the provisioned administrator account.'}
      </p>
      {(loginError || sessionError) && (
        <p role="alert" className="ea-notice ea-notice--error">
          {loginError ?? sessionError}
        </p>
      )}
      {mfaStep === 'setup' && mfaSetup && (
        <div className="ea-preview">
          <p className="ea-label">Add Postern to your authenticator app</p>
          <TotpQrCode authenticatorUri={mfaSetup.authenticatorUri} />
          <a href={mfaSetup.authenticatorUri} className="ea-link">
            Open in an authenticator app
          </a>
          <p className="ea-hint">Or enter this setup key manually:</p>
          <code className="ea-mono">{mfaSetup.secret}</code>
        </div>
      )}
      {mfaStep ? (
        <form className="ea-admin-form" onSubmit={handleMfaSubmit}>
          <div className="ea-field">
            <label htmlFor="admin-mfa-code" className="ea-label">Authenticator code</label>
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
              className="input ea-admin-code"
            />
          </div>
          <button type="submit" className="btn btn--primary" disabled={isSigningIn}>
            {isSigningIn ? 'Verifying…' : mfaStep === 'setup' ? 'Enable and continue' : 'Verify and sign in'}
          </button>
        </form>
      ) : (
        <form className="ea-admin-form" onSubmit={handleLogin}>
          <div className="ea-field">
            <label htmlFor="admin-email" className="ea-label">Email address</label>
            <input
              id="admin-email"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="input"
            />
          </div>
          <div className="ea-field">
            <label htmlFor="admin-password" className="ea-label">Password</label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="input"
            />
          </div>
          <button type="submit" className="btn btn--primary" disabled={isSigningIn}>
            {isSigningIn ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}
      {recoveryKey && <RecoveryKeyNotice recoveryKey={recoveryKey} className="ea-admin-notice" />}
      <a href="/" className="ea-link">
        Back to Postern
      </a>
    </section>
  )
}
