import { useEffect, useId, useRef, useState } from 'react'

interface ConfirmationMatch {
  /** Label shown above the confirmation input. */
  label: string
  /** The exact text the user must type to enable the confirm action. */
  expected: string
  /** Optional extra guidance shown under the input. */
  hint?: string
}

interface ConfirmationDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel?: string
  busyLabel?: string
  busy?: boolean
  /**
   * When set, the confirm action stays disabled until the user types this
   * value exactly. The field resets whenever the dialog opens.
   */
  confirmMatch?: ConfirmationMatch
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Keep request',
  busyLabel = 'Working…',
  busy = false,
  confirmMatch,
  onCancel,
  onConfirm,
}: Readonly<ConfirmationDialogProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [typed, setTyped] = useState('')
  const wasOpen = useRef(false)
  const inputId = useId()
  const hintId = useId()

  const resetTyped = () => setTyped('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) {
      return
    }

    if (open && !dialog.open) {
      dialog.showModal()
      if (!wasOpen.current) {
        resetTyped()
      }
      wasOpen.current = true
    } else if (!open && dialog.open) {
      dialog.close()
      wasOpen.current = false
      resetTyped()
    } else if (!open) {
      wasOpen.current = false
    }
  }, [open])

  const matchSatisfied = !confirmMatch || typed === confirmMatch.expected
  const confirmDisabled = busy || !matchSatisfied

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="confirmation-title"
      aria-describedby="confirmation-description"
      onCancel={(event) => {
        if (busy) {
          event.preventDefault()
          return
        }
        onCancel()
      }}
    >
      <div className="dialog__header">
        <h2 id="confirmation-title" className="text-xl font-bold text-text">
          {title}
        </h2>
      </div>
      <div className="dialog__body space-y-3">
        <p id="confirmation-description">{description}</p>
        {confirmMatch && (
          <div>
            <label htmlFor={inputId} className="mb-1 block text-sm font-semibold text-text">
              {confirmMatch.label}
            </label>
            <input
              id={inputId}
              type="text"
              className="input w-full"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              aria-describedby={confirmMatch.hint ? hintId : undefined}
            />
            {confirmMatch.hint && (
              <p id={hintId} className="mt-1 text-xs text-text-muted">
                {confirmMatch.hint}
              </p>
            )}
          </div>
        )}
      </div>
      <div className="dialog__footer">
        <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className="btn btn--danger-solid"
          onClick={onConfirm}
          disabled={confirmDisabled}
          autoFocus={!confirmMatch}
        >
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </dialog>
  )
}
