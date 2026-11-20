import { useEffect, useId, useRef } from 'react'
import type { CreateAliasInput, CreateAliasOutcome } from '../../types'
import { AliasComposer } from './AliasComposer'

interface CreateAliasDialogProps {
  open: boolean
  isCreating: boolean
  error: string | null
  existingDomain: string | null
  onCreate: (input: CreateAliasInput) => Promise<CreateAliasOutcome>
  onClose: () => void
}

export function CreateAliasDialog({
  open,
  isCreating,
  error,
  existingDomain,
  onCreate,
  onClose,
}: Readonly<CreateAliasDialogProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) {
      return
    }

    if (open && !dialog.open) {
      dialog.showModal()
      dialog.querySelector<HTMLInputElement>('input')?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="dialog ea-create-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="dialog__header ea-create-dialog__header">
        <div>
          <h2 id={titleId} className="ea-dialog__title">
            Create an alias
          </h2>
        </div>
        <button
          type="button"
          className="ea-icon-btn"
          onClick={onClose}
          aria-label="Close create alias dialog"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>

      <div className="dialog__body">
        <p className="ea-dialog__intro">
          Name it after the service you are signing up for. Postern adds a random suffix so the
          address stays unguessable.
        </p>
        <AliasComposer
          showHeading={false}
          isCreating={isCreating}
          error={error}
          existingDomain={existingDomain}
          onCreate={onCreate}
        />
      </div>

      <div className="dialog__footer">
        <button type="button" className="btn btn--secondary" onClick={onClose}>
          Cancel
        </button>
      </div>
    </dialog>
  )
}
