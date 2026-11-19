import { useRef, useState } from 'react'
import { apiUrl } from '../../services/apiBase'

export interface RequestInviteState {
  email: string
  error: string | null
  success: string | null
  submitting: boolean
}

export interface RequestInviteProps {
  className?: string
  variant?: 'trigger' | 'inline'
}

export function RequestInvite({
  className = '',
  variant = 'trigger',
}: Readonly<RequestInviteProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [state, setState] = useState<RequestInviteState>({
    email: '',
    error: null,
    success: null,
    submitting: false,
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setState({ ...state, email: e.target.value, error: null, success: null })

  const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault()
    const { email, submitting } = state
    if (submitting) {
      return
    }
    setState({ ...state, submitting: true, error: null, success: null })

    try {
      const result = await fetch(apiUrl('/api/invite-requests'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        credentials: 'include',
      })

      if (!result.ok) {
        let message = 'Failed to request invite. Please try again.'
        try {
          const errorData = await result.json()
          if (typeof errorData.error === 'string') {
            message = errorData.error
          }
        } catch {

        }
        setState({ ...state, error: message, submitting: false })
        return
      }

      setState({
        email: '',
        submitting: false,
        error: null,
        success: 'Your request has been recorded. An admin will review it, and we’ll email you if it’s approved.',
      })
    } catch (error) {
      console.error('Invite request failed', error)
      setState({
        ...state,
        submitting: false,
        error: 'Unable to send your request right now. Please try again.',
      })
    }
  }

  const isInline = variant === 'inline'
  const emailId = isInline ? 'request-invite-email' : 'invite-email'
  const emailHelpId = isInline ? 'request-invite-email-help' : 'invite-email-help'

  if (isInline) {
    return (
      <div className={className}>
        {state.error && (
          <p role="alert" className="mb-6 text-sm text-danger">
            {state.error}
          </p>
        )}

        {state.success ? (
          <div role="status" className="space-y-4">
            <div className="mb-1 font-semibold text-accent">✓ Request received</div>
            <p className="text-sm leading-relaxed text-text-secondary">{state.success}</p>
            <p className="text-sm text-text-secondary">
              Already had your invitation accepted?{' '}
              <a href="/login">Sign in</a>
              .
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-8">
            <div>
              <label htmlFor={emailId} className="flex w-full flex-col gap-2">
                <span className="text-[13px] font-semibold leading-[18px] tracking-[0.02em] text-on-surface">
                  Your email address
                </span>
                <input
                  id={emailId}
                  type="text"
                  value={state.email}
                  onChange={handleChange}
                  disabled={state.submitting}
                  required
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full border-0 border-b border-outline-variant bg-transparent p-0 py-3 text-[18px] leading-[30px] text-on-surface outline-none transition-colors duration-150 placeholder:text-on-surface-variant focus:border-primary focus:ring-0"
                  placeholder="you@example.com"
                  autoComplete="email"
                  aria-describedby={emailHelpId}
                />
                <span
                  id={emailHelpId}
                  className="mt-1 text-[12px] leading-[18px] text-on-surface-variant"
                >
                  We’ll only use this to send your invitation and forward your mail once active.
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={state.submitting}
              className="editorial-button editorial-button--primary w-full"
            >
              {state.submitting ? 'Sending...' : 'Request an invite'}
            </button>

            <p className="pt-2 text-center text-sm text-text-secondary">
              Already had your invitation accepted?{' '}
              <a href="/login" className="font-medium text-text">
                Sign in
              </a>
              .
            </p>
          </form>
        )}
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        className={`btn btn--primary btn--lg ${className}`.trim()}
        onClick={() => dialogRef.current?.showModal()}
      >
        Request an invite
      </button>

      <dialog ref={dialogRef} className="dialog" aria-labelledby="request-invite-title">
        <div className="dialog__header flex items-start justify-between gap-4">
          <div>
            <h2 id="request-invite-title" className="text-h4 text-text">
              Request an invite
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              An admin will review your request and activate your invite.
            </p>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--sm shrink-0"
            aria-label="Close invite request"
            onClick={() => dialogRef.current?.close()}
          >
            Close
          </button>
        </div>

        <div className="dialog__body">
          {state.error && (
            <p role="alert" className="mb-4 text-sm text-danger">
              {state.error}
            </p>
          )}

          {state.success ? (
            <div className="space-y-4">
              <p role="status" className="text-sm text-success">
                {state.success}
              </p>
              <p className="text-sm text-text-secondary">
                Already had your invitation accepted? <a href="/login">Sign in</a>.
              </p>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => dialogRef.current?.close()}
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="field">
                <label htmlFor={emailId} className="field__label">
                  Email address
                </label>
                <input
                  id={emailId}
                  type="text"
                  value={state.email}
                  onChange={handleChange}
                  disabled={state.submitting}
                  required
                  autoCapitalize="none"
                  spellCheck={false}
                  className="input"
                  placeholder="you@example.com"
                  autoComplete="email"
                  aria-describedby={emailHelpId}
                />
                <p id={emailHelpId} className="field__hint">
                  We’ll email you if your request is approved. We use your address only to review
                  and respond to this request — see our{' '}
                  <a href="/privacy" className="font-medium">
                    Privacy Policy
                  </a>
                  .
                </p>
              </div>
              <button type="submit" disabled={state.submitting} className="btn btn--primary btn--block">
                {state.submitting ? 'Sending...' : 'Send request'}
              </button>
              <p className="text-center text-sm text-text-secondary">
                Already had your invitation accepted? <a href="/login">Sign in</a>.
              </p>
            </form>
          )}
        </div>
      </dialog>
    </>
  )
}
