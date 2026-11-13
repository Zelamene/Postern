import { useEffect, useState } from 'react'
import { apiUrl } from '../services/apiBase'

interface InviteRegistrationPageProps {
  inviteCode: string
}

interface RegistrationState {
  email: string | null
  password: string
  error: string | null
  complete: boolean
  loadingInvite: boolean
  submitting: boolean
}

export function InviteRegistrationPage({ inviteCode }: Readonly<InviteRegistrationPageProps>) {
  const [state, setState] = useState<RegistrationState>({
    email: null,
    password: '',
    error: null,
    complete: false,
    loadingInvite: true,
    submitting: false,
  })

  useEffect(() => {
    let active = true

    const resolveInvite = async () => {
      try {
        const response = await fetch(apiUrl('/api/auth/invite-details'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviteCode }),
          credentials: 'include',
        })
        if (!response.ok) {
          throw new Error(`Invite lookup failed with status ${response.status}.`)
        }

        const body: unknown = await response.json()
        if (typeof body !== 'object' || body === null || !('email' in body)) {
          throw new Error('Invite lookup returned an invalid response.')
        }
        const email = body.email
        if (typeof email !== 'string') {
          throw new Error('Invite lookup returned an invalid response.')
        }

        if (active) {
          setState((current) => ({
            ...current,
            email,
            error: null,
            loadingInvite: false,
          }))
        }
      } catch (error) {
        if (!active) {
          return
        }
        console.error('Invite lookup failed', error)
        setState((current) => ({
          ...current,
          email: null,
          error: 'We could not verify this invitation. Check the link or request a new invite.',
          loadingInvite: false,
        }))
      }
    }

    void resolveInvite()
    return () => {
      active = false
    }
  }, [inviteCode])

  const handleSubmit = async (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (state.submitting || state.email === null) {
      return
    }

    setState({ ...state, error: null, submitting: true })
    try {
      const response = await fetch(apiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: state.password,
          inviteCode,
        }),
        credentials: 'include',
      })

      if (response.status === 202) {
        setState({ ...state, password: '', error: null, complete: true, submitting: false })
        return
      }

      let errorMessage = 'We could not accept this invitation. Check your details and try again.'
      try {
        const body = await response.json()
        if (body.error === 'invalid_invite') {
          errorMessage = 'This invitation is invalid, expired, or has already been used.'
        } else if (body.error === 'registration_unavailable') {
          errorMessage = 'We could not complete registration with these details.'
        } else if (body.error === 'user_limit_reached') {
          errorMessage = 'Postern is not accepting additional accounts right now.'
        } else if (body.errors?.request?.[0]) {
          errorMessage = body.errors.request[0]
        }
      } catch {
        // Keep the generic message when the server does not return JSON.
      }
      setState({ ...state, error: errorMessage, submitting: false })
    } catch (error) {
      console.error('Invite registration failed', error)
      setState({
        ...state,
        error: 'Unable to reach Postern right now. Please try again.',
        submitting: false,
      })
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-12 text-text">
      <section
        className="w-full max-w-lg rounded-2xl border border-hairline bg-surface p-6 shadow-md sm:p-9"
        aria-labelledby="invite-title"
      >
        <a href="/" className="text-sm font-extrabold tracking-tight text-primary no-underline">
          Postern
        </a>

        {state.complete ? (
          <div className="mt-8 space-y-4">
            <p className="chip chip--success chip--sm">Invitation accepted</p>
            <h1 id="invite-title" className="text-2xl font-bold text-text">
              One last step.
            </h1>
            <p className="text-sm leading-relaxed text-text-secondary" role="status">
              Your account is ready for email verification. Sign in after your destination is
              verified to activate it.
            </p>
            <a href="/login" className="btn btn--primary inline-flex">
              Go to login
            </a>
          </div>
        ) : (
          <>
            <div className="mt-8 space-y-3">
              <p className="chip chip--primary chip--sm">You’re invited</p>
              <h1 id="invite-title" className="text-2xl font-bold text-text">
                Create your Postern account
              </h1>
              <p className="text-sm leading-relaxed text-text-secondary">
                This invitation is linked to the email address below. Set a password to continue.
              </p>
            </div>

            {state.error && (
              <p role="alert" className="mt-6 rounded-lg bg-danger-surface p-3 text-sm text-danger">
                {state.error}
              </p>
            )}

            {state.loadingInvite ? (
              <p role="status" className="mt-7 text-sm text-text-muted">
                Verifying your invitation…
              </p>
            ) : state.email !== null ? (
              <form onSubmit={handleSubmit} className="mt-7 space-y-5">
                <div>
                  <label htmlFor="registration-email" className="mb-1.5 block text-sm font-semibold">
                    Invited email address
                  </label>
                  <input
                    id="registration-email"
                    type="text"
                    autoComplete="email"
                    value={state.email}
                    readOnly
                    aria-readonly="true"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label htmlFor="registration-password" className="mb-1.5 block text-sm font-semibold">
                    Password
                  </label>
                  <input
                    id="registration-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    required
                    value={state.password}
                    disabled={state.submitting}
                    onChange={(event) =>
                      setState({ ...state, password: event.target.value, error: null })
                    }
                    aria-describedby="password-help"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <p id="password-help" className="mt-1.5 text-xs text-text-muted">
                    Use 12–128 characters.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={state.submitting}
                  className="btn btn--primary w-full"
                >
                  {state.submitting ? 'Creating account…' : 'Accept invitation'}
                </button>
              </form>
            ) : (
              <a href="/" className="btn btn--secondary mt-7 inline-flex">
                Back to Postern
              </a>
            )}

            <p className="mt-5 text-xs leading-relaxed text-text-muted">
              By creating an account, you agree to our{' '}
              <a href="/terms" className="font-semibold">
                Terms of Service
              </a>{' '}
              and acknowledge our{' '}
              <a href="/privacy" className="font-semibold">
                Privacy Policy
              </a>
              . This invitation is single-use and expires after seven days.
            </p>
          </>
        )}
      </section>
    </main>
  )
}
