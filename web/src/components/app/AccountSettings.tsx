import { useId, useState, type SubmitEvent } from 'react'
import { ConfirmationDialog } from '../common/ConfirmationDialog'
import { useToast } from '../common/toast'
import {
  changeForwardingAddress,
  deleteAccount,
} from '../../services/accountService'
import { ApiError } from '../../services/apiClient'
import type { CurrentAccount } from '../../types'

interface AccountSettingsProps {
  account: CurrentAccount
  onForwardingAddressChange: (address: string) => void
  onAccountDeleted: () => void
  isSigningOut: boolean
  onSignOut: () => void
}

function describeError(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status === 401) {
    return 'Your session has ended. Sign in again to change your account.'
  }

  if (error instanceof ApiError && error.status === 409) {
    return 'Confirm the new destination from the verification email, then save again.'
  }

  return fallback
}

export function AccountSettings({
  account,
  onForwardingAddressChange,
  onAccountDeleted,
  isSigningOut,
  onSignOut,
}: Readonly<AccountSettingsProps>) {
  const toast = useToast()
  const [forwardingAddress, setForwardingAddress] = useState(account.forwardingAddress)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const forwardingId = useId()

  async function handleForwardingSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextAddress = forwardingAddress.trim()
    if (!nextAddress || isSaving) {
      return
    }

    setIsSaving(true)
    setSaveError(null)
    setSaveNotice(null)

    try {
      await changeForwardingAddress(nextAddress)
      setForwardingAddress(nextAddress)
      onForwardingAddressChange(nextAddress)
      setSaveNotice('Forwarding address updated. New mail is delivered there.')
      toast.success('Forwarding address updated.')
    } catch (error) {
      const message = describeError(
        error,
        'The forwarding address could not be updated. Check the address and try again.',
      )
      setSaveError(message)
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (isDeleting) {
      return
    }

    setIsDeleting(true)
    setDeleteError(null)

    try {
      await deleteAccount()
      setIsDeleteOpen(false)
      onAccountDeleted()
    } catch (error) {
      const message = describeError(error, 'The account could not be deleted. Try again in a moment.')
      setDeleteError(message)
      toast.error(message)
      setIsDeleting(false)
      setIsDeleteOpen(false)
    }
  }

  return (
    <div className="ea-stack">
      <div className="ea-hero">
        <div>
          <h1 className="ea-title ea-title--md">Account settings</h1>
          <p className="ea-lede">
            Your aliases forward into one destination inbox. Change it here without touching any
            alias.
          </p>
        </div>
      </div>

      <section
        className="ea-card ea-card__pad"
        aria-labelledby={`${forwardingId}-title`}
      >
        <h2 id={`${forwardingId}-title`} className="ea-section-title">
          Forwarding destination
        </h2>
        <p className="ea-hint">
          Mail sent to any of your aliases is relayed to this address.
        </p>

        <div className="ea-spec">
          <div>
            <span className="ea-spec__label">Current forwarding destination</span>
            <span className="ea-spec__value">{account.forwardingAddress}</span>
          </div>
          <div>
            <span className="ea-spec__label">Account sign-in</span>
            <span className="ea-spec__value ea-spec__value--sm">{account.email}</span>
          </div>
        </div>

        <form className="ea-composer__grid" onSubmit={handleForwardingSubmit}>
          <div className="ea-field ea-field--wide">
            <label htmlFor={forwardingId} className="ea-label">
              Destination address
            </label>
            {/* Plain text on purpose: native email validation rejects valid
                Universal Acceptance addresses that the backend accepts. */}
            <input
              id={forwardingId}
              type="text"
              inputMode="email"
              className="input"
              value={forwardingAddress}
              onChange={(event) => {
                setForwardingAddress(event.target.value)
                setSaveNotice(null)
                setSaveError(null)
              }}
              autoComplete="email"
              spellCheck={false}
              required
              disabled={isSaving}
            />
            <p className="ea-hint">
              Confirm any verification sent to a new address before relying on it.
            </p>

            {saveError && (
              <p role="alert" className="ea-notice ea-notice--error ea-notice--inline">
                {saveError}
              </p>
            )}

            {saveNotice && (
              <output className="ea-notice ea-notice--inline">{saveNotice}</output>
            )}
          </div>

          <div className="ea-field ea-field--wide ea-inline-action">
            <span className="ea-inline-action__note">
              Every alias forwards here. Updating this destination does not change alias addresses.
            </span>
            <button type="submit" className="btn btn--primary" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Update destination'}
            </button>
          </div>
        </form>
      </section>

      <section
        className="ea-card ea-card__pad"
        aria-labelledby={`${forwardingId}-session`}
      >
        <h2 id={`${forwardingId}-session`} className="ea-section-title">
          Session
        </h2>
        <p className="ea-hint">Signed in as {account.email}.</p>
        <div className="ea-card__foot">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onSignOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </section>

      <section
        className="ea-danger"
        aria-labelledby={`${forwardingId}-danger`}
      >
        <h2 id={`${forwardingId}-danger`} className="ea-section-title">
          Delete account
        </h2>
        <p className="ea-lede">
          Deleting your account retires every alias and stops all forwarding. This cannot be
          undone.
        </p>

        <div className="ea-danger__box">
          <div>
            <h3 className="ea-card__title">Retire every alias</h3>
            <p className="ea-hint">
              This closes the account and stops delivery to the destination above.
            </p>
            {deleteError && (
              <p role="alert" className="ea-notice ea-notice--error ea-notice--inline">
                {deleteError}
              </p>
            )}
          </div>
          <button
            type="button"
            className="btn btn--danger-solid"
            onClick={() => setIsDeleteOpen(true)}
          >
            Delete my account
          </button>
        </div>
      </section>

      <ConfirmationDialog
        open={isDeleteOpen}
        title="Delete your Postern account?"
        description={`This permanently deletes ${account.email}, retires all of its aliases, and stops forwarding. This cannot be undone.`}
        confirmLabel="Delete account"
        cancelLabel="Keep account"
        busyLabel="Deleting…"
        busy={isDeleting}
        confirmMatch={{
          label: `Type ${account.email} to confirm`,
          expected: account.email,
          hint: 'This confirms you are deleting the right account.',
        }}
        onCancel={() => setIsDeleteOpen(false)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  )
}
