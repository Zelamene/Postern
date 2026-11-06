import { useRef, useState } from 'react'

export interface RequestInviteState {
  email: string
  error: string | null
  success: string | null
  submitting: boolean
}

export function RequestInvite() {
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
      const result = await fetch('/api/invite-requests', {
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
          // Keep the generic message when the server does not return JSON.
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

  return (
    <>
      <button
        type="button"
        className="btn btn--primary btn--lg"
        onClick={() => dialogRef.current?.showModal()}
      >
        Request an invite
      </button>

      <dialog ref={dialogRef} className="dialog" aria-labelledby="request-invite-title">
        <div className="dialog__header flex items-start justify-between gap-4">
          <div>
            <h2 id="request-invite-title" className="text-xl font-bold text-text">
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
              <div>
                <label htmlFor="invite-email" className="mb-1 block text-sm font-medium text-text">
                  Email address
                </label>
                <input
                  id="invite-email"
                  type="text"
                  value={state.email}
                  onChange={handleChange}
                  disabled={state.submitting}
                  required
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full rounded-md border border-hairline px-3 py-2 text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  placeholder="you@example.com"
                  autoComplete="email"
                  aria-describedby="invite-email-help"
                />
                <p id="invite-email-help" className="mt-1 text-xs text-text-muted">
                  We’ll email you if your request is approved.
                </p>
              </div>
              <button
                type="submit"
                disabled={state.submitting}
                className="btn btn--primary w-full"
              >
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