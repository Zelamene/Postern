import { useEffect, useRef } from 'react'

interface ConfirmationDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onCancel,
  onConfirm,
}: Readonly<ConfirmationDialogProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) {
      return
    }

    if (open && !dialog.open) {
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="confirmation-title"
      aria-describedby="confirmation-description"
      onCancel={onCancel}
    >
      <div className="dialog__header">
        <h2 id="confirmation-title" className="text-xl font-bold text-text">
          {title}
        </h2>
      </div>
      <div className="dialog__body">
        <p id="confirmation-description">{description}</p>
      </div>
      <div className="dialog__footer">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={onCancel}
          disabled={busy}
        >
          Keep request
        </button>
        <button
          type="button"
          className="btn btn--danger-solid"
          onClick={onConfirm}
          disabled={busy}
          autoFocus
        >
          {busy ? 'Rejecting…' : confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
