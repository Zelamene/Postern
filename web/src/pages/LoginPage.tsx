import { useState, type FormEvent } from 'react'
import { apiUrl } from '../services/apiBase'
import { navigate } from '../services/navigation'
import { stashRecoveryKey } from '../services/pendingRecoveryKey'

interface LoginResult {
  email?: string | null
  recoveryKey?: string | null
  mfaRequired?: boolean
  mfaSetupRequired?: boolean
}

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [adminSignIn, setAdminSignIn] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) {
      return
    }

    setIsSubmitting(true)
    setError(null)
    setAdminSignIn(false)
    try {
      const response = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (response.status === 401) {
        setError('Email or password is incorrect.')
        return
      }

      if (response.status === 403) {
        setError(
          'Your account needs destination verification before it can be activated. Once verified, sign in again.',
        )
        return
      }

      if (!response.ok) {
        setError('Sign-in is unavailable right now. Please try again.')
        return
      }

      const result = (await response.json()) as LoginResult
      if (result.mfaRequired || result.mfaSetupRequired) {
        setAdminSignIn(true)
        setError('This is an administrator account. Please sign in through the admin page.')
        return
      }

      setPassword('')
      if (result.recoveryKey) {
        stashRecoveryKey(result.recoveryKey)
      }

      navigate('/app', { replace: true })
    } catch (requestError) {
      console.error('User sign-in failed', requestError)
      setError('Unable to reach Postern right now. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-12 text-text">
      <section
        className="w-full max-w-lg bg-surface p-6 sm:p-9"
        aria-labelledby="login-title"
      >
        <a href="/" className="text-lg tracking-tight text-text no-underline">
          Postern
        </a>

        <div className="mt-8 space-y-3">
          <p className="chip chip--primary chip--sm">Invite only</p>
          <h1 id="login-title" className="text-h2 text-text">
            Sign in to Postern
          </h1>
          <p className="text-sm leading-relaxed text-text-secondary">
            Postern is an invite-only platform. Sign in after your invitation has been accepted and
            your account is ready.
          </p>
        </div>

        {error && (
          <p role="alert" className="mt-6 bg-danger-surface p-3 text-sm text-danger">
            {error}
            {adminSignIn && (
              <>
                {' '}
                <a href="/admin">Go to admin sign in</a>.
              </>
            )}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-7 space-y-5">
          <div className="field">
            <label htmlFor="login-email" className="field__label">
              Email address
            </label>
            <input
              id="login-email"
              type="text"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              value={email}
              disabled={isSubmitting}
              onChange={(event) => setEmail(event.target.value)}
              className="input"
            />
          </div>

          <div className="field">
            <label htmlFor="login-password" className="field__label">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              disabled={isSubmitting}
              onChange={(event) => setPassword(event.target.value)}
              className="input"
            />
          </div>

          <button type="submit" disabled={isSubmitting} className="btn btn--primary btn--block">
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-text-secondary">
          Don’t have an accepted invitation? <a href="/">Request an invite</a>.
        </p>
      </section>
    </main>
  )
}
