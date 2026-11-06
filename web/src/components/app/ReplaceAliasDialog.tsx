import { useEffect, useRef, useState } from 'react'
import {
  createAlias,
  deleteAlias,
  linkReplacement,
} from '../../services/aliasService'
import type { Alias } from '../../services/aliasService'
import { copyText, selectText } from '../../services/clipboard'
import { describeAliasError } from '../../services/aliasErrors'
import { IconCheck, IconCopy } from '../common/Icons'

type CopyState = 'idle' | 'copied' | 'manual'

interface ReplaceAliasDialogProps {
  open: boolean
  alias: Alias | null
  onClose: () => void
  onReplaced: (replacement: Alias) => void
}

/**
 * Kills a leak without losing the account.
 *
 * The replacement address has to exist before the user can hand it to the
 * service, so it is reserved first and only linked to the old alias on
 * confirm. Cancelling before that point discards the reservation.
 */
export function ReplaceAliasDialog({
  open,
  alias,
  onClose,
  onReplaced,
}: Readonly<ReplaceAliasDialogProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const addressRef = useRef<HTMLElement>(null)
  const reservedRef = useRef<Alias | null>(null)
  const [replacement, setReplacement] = useState<Alias | null>(null)
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const [isPreparing, setIsPreparing] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(
    () => () => {
      const reserved = reservedRef.current
      if (reserved) {
        void deleteAlias(reserved.id).catch(() => {
          // A leftover alias is harmless; the user can delete it from the list.
        })
      }
    },
    [],
  )

  function reset() {
    reservedRef.current = null
    setReplacement(null)
    setCopyState('idle')
    setError(null)
  }

  async function prepare() {
    if (!alias || isPreparing) {
      return
    }

    setIsPreparing(true)
    setError(null)

    try {
      const reserved = await createAlias({
        label: alias.label ?? 'default',
        category: alias.category,
        expectedSender: null,
      })
      reservedRef.current = reserved
      setReplacement(reserved)
    } catch (prepareError) {
      setError(
        describeAliasError(
          prepareError,
          'The new address could not be reserved. Check your connection and try again.',
        ),
      )
    } finally {
      setIsPreparing(false)
    }
  }

  async function copyAddress() {
    const address = replacement?.fullAddress
    if (!address) {
      return
    }

    if (await copyText(address)) {
      setCopyState('copied')
      return
    }

    selectText(addressRef.current)
    setCopyState('manual')
  }

  async function confirm() {
    if (!alias || !replacement || isConfirming || copyState === 'idle') {
      return
    }

    setIsConfirming(true)
    setError(null)

    try {
      await linkReplacement(alias.id, replacement.id)
      reset()
      onReplaced(replacement)
      onClose()
    } catch (confirmError) {
      setError(
        describeAliasError(
          confirmError,
          'The replacement could not be confirmed. Check your connection and try again.',
        ),
      )
    } finally {
      setIsConfirming(false)
    }
  }

  function cancel() {
    const reserved = replacement
    reset()
    onClose()

    if (reserved) {
      void deleteAlias(reserved.id).catch(() => {
        // A leftover alias is harmless; the user can delete it from the list.
      })
    }
  }

  const isBusy = isPreparing || isConfirming
  const label = alias?.label ?? 'this alias'
  const canConfirm = replacement !== null && copyState !== 'idle' && !isBusy

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="replace-alias-title"
      aria-describedby="replace-alias-description"
      onCancel={cancel}
    >
      <div className="dialog__header">
        <h2 id="replace-alias-title" className="text-xl font-bold text-text">
          Kill the leak, keep the service
        </h2>
      </div>

      <div className="dialog__body space-y-4">
        <p id="replace-alias-description">
          Postern reserves a new address for <span className="font-semibold">{label}</span> and
          retires the current one, so mail sent to the leaked address stops.
        </p>

        <ol className="space-y-4">
          <li className="flex gap-3">
            <StepNumber step={1} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-text">Reserve the new address and copy it.</p>
              {replacement?.fullAddress ? (
                <>
                  <code
                    ref={addressRef}
                    className="mt-2 block break-all rounded-lg bg-surface-sunken px-3 py-2 text-sm text-text"
                  >
                    {replacement.fullAddress}
                  </code>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn btn--secondary btn--sm"
                      onClick={() => void copyAddress()}
                    >
                      {copyState === 'copied' ? (
                        <IconCheck className="btn__icon" />
                      ) : (
                        <IconCopy className="btn__icon" />
                      )}
                      {copyState === 'copied' ? 'Copied' : 'Copy address'}
                    </button>
                    {copyState === 'manual' && (
                      <span role="status" className="text-xs text-text-muted">
                        Could not copy automatically — the address is selected, so use your
                        keyboard to copy it.
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-1 text-text-muted">
                  Reserve the address first, then copy it before confirming.
                </p>
              )}
            </div>
          </li>

          <li className="flex gap-3">
            <StepNumber step={2} />
            <div>
              <p className="font-semibold text-text">Change the address at {label}.</p>
              <p className="mt-1 text-text-muted">
                Paste the new address into the service’s account settings, in place of the old
                one.
              </p>
            </div>
          </li>

          <li className="flex gap-3">
            <StepNumber step={3} />
            <div>
              <p className="font-semibold text-text">Confirm the swap.</p>
              <p className="mt-1 text-text-muted">
                The old address stops delivering immediately. Its history stays readable.
              </p>
            </div>
          </li>
        </ol>

        {!replacement && (
          <p className="text-xs text-text-muted">
            The new address is only linked to this alias when you confirm.
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      <div className="dialog__footer">
        <button type="button" className="btn btn--secondary" onClick={cancel} disabled={isBusy}>
          Cancel
        </button>
        {replacement ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void confirm()}
            disabled={!canConfirm}
            aria-busy={isConfirming || undefined}
          >
            {isConfirming ? 'Replacing…' : 'Confirm replacement'}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void prepare()}
            disabled={isBusy}
            aria-busy={isPreparing || undefined}
            autoFocus
          >
            {isPreparing ? 'Reserving…' : 'Reserve new address'}
          </button>
        )}
      </div>
    </dialog>
  )
}

function StepNumber({ step }: Readonly<{ step: number }>) {
  return (
    <span
      className="inline-flex size-6 flex-none items-center justify-center rounded-full bg-primary-subtle text-xs font-bold text-primary"
      aria-hidden="true"
    >
      {step}
    </span>
  )
}
