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
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Account</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Account settings</h1>
        <p className="mt-2 max-w-prose text-sm text-text-muted">
          Your aliases forward into one destination inbox. Change it here without touching any
          alias.
        </p>
      </div>

      <section
        className="rounded-2xl border border-hairline bg-surface p-5 shadow-sm sm:p-6"
        aria-labelledby={`${forwardingId}-title`}
      >
        <h2 id={`${forwardingId}-title`} className="text-xl font-bold">
          Forwarding destination
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Mail sent to any of your aliases is relayed to this address.
        </p>

        <dl className="mt-4 grid gap-1 text-sm">
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Sign-in email
          </dt>
          <dd className="break-all font-medium">{account.email}</dd>
        </dl>

        <form className="mt-5 space-y-3" onSubmit={handleForwardingSubmit}>
          <div>
            <label htmlFor={forwardingId} className="mb-1 block text-sm font-semibold">
              Destination address
            </label>
            <input
              id={forwardingId}
              type="email"
              className="input w-full"
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
          </div>

          {saveError && (
            <p role="alert" className="text-sm text-danger">
              {saveError}
            </p>
          )}

          {saveNotice && (
            <output className="text-sm text-success">
              {saveNotice}
            </output>
          )}

          <button type="submit" className="btn btn--primary" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Update destination'}
          </button>
        </form>
      </section>

      <section
        className="rounded-2xl border border-danger/40 bg-danger-surface/40 p-5 sm:p-6"
        aria-labelledby={`${forwardingId}-danger`}
      >
        <h2 id={`${forwardingId}-danger`} className="text-xl font-bold">
          Delete account
        </h2>
        <p className="mt-1 max-w-prose text-sm text-text-secondary">
          Deleting your account retires every alias and stops all forwarding. This cannot be
          undone.
        </p>

        {deleteError && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {deleteError}
          </p>
        )}

        <button
          type="button"
          className="btn btn--danger-solid mt-4"
          onClick={() => setIsDeleteOpen(true)}
        >
          Delete my account
        </button>
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
