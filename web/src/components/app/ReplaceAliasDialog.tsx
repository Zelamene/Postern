import { useEffect, useRef, useState } from 'react'
import {
  createAlias,
  deleteAlias,
  linkReplacement,
  DEFAULT_ALIAS_CATEGORY,
  type Alias,
} from '../../services/aliasService'
import { copyText, selectText } from '../../services/clipboard'
import { describeAliasError } from '../../services/aliasErrors'
import { IconAlertTriangle, IconCopy, IconCheck } from '../common/Icons'
import { useToast } from '../common/toast'

type Step = 'reserve' | 'confirm'
type CopyState = 'idle' | 'copied' | 'manual'

interface ReplaceAliasDialogProps {
  open?: boolean
  alias: Alias | null
  onClose: () => void
  onReplaced: (replacement: Alias) => void
}

export function ReplaceAliasDialog({
  open,
  alias,
  onClose,
  onReplaced,
}: Readonly<ReplaceAliasDialogProps>) {
  const toast = useToast()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const addressRef = useRef<HTMLElement>(null)
  const reservedRef = useRef<Alias | null>(null)
  const [step, setStep] = useState<Step>('reserve')
  const [replacement, setReplacement] = useState<Alias | null>(null)
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const [isReserving, setIsReserving] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isOpen = (open ?? alias !== null) && alias !== null

  const discardReservation = (reserved: Alias | null) => {
    if (reserved) {
      void deleteAlias(reserved.id).catch(() => undefined)
    }
  }

  const reset = () => {
    setStep('reserve')
    setReplacement(null)
    reservedRef.current = null
    setCopyState('idle')
    setIsReserving(false)
    setIsConfirming(false)
    setError(null)
  }

  const handleClose = () => {
    discardReservation(reservedRef.current)
    reset()
    onClose()
  }

  const prevOpen = useRef(false)
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) {
      return
    }

    if (isOpen && !dialog.open) {
      if (!prevOpen.current) {
        reset()
      }
      dialog.showModal()
      prevOpen.current = true
    } else if (!isOpen && dialog.open) {
      dialog.close()
      discardReservation(reservedRef.current)
      reservedRef.current = null
      prevOpen.current = false
    } else if (!isOpen) {
      prevOpen.current = false
    }
  }, [isOpen])

  useEffect(
    () => () => {
      discardReservation(reservedRef.current)
    },
    [],
  )

  async function reserveAddress() {
    if (!alias || isReserving) {
      return
    }

    setIsReserving(true)
    setError(null)

    try {
      const next = await createAlias({
        label: alias.label ?? 'alias',
        category: alias.category ?? DEFAULT_ALIAS_CATEGORY,
        expectedSender: null,
      })
      reservedRef.current = next
      setReplacement(next)
      setStep('confirm')
    } catch (cause) {
      setError(describeAliasError(cause, 'The new address could not be created. Try again.'))
    } finally {
      setIsReserving(false)
    }
  }

  async function copyAddress() {
    const address = replacement?.fullAddress
    if (!address) {
      return
    }

    if (await copyText(address)) {
      setCopyState('copied')
      toast.success('New address copied.')
      return
    }

    selectText(addressRef.current)
    setCopyState('manual')
    toast.error('Could not copy automatically. The address is selected for manual copy.')
  }

  async function confirmReplace() {
    if (!alias || !replacement || isConfirming || copyState === 'idle') {
      return
    }

    setIsConfirming(true)
    setError(null)

    try {
      await linkReplacement(alias.id, replacement.id)
      reservedRef.current = null
      const replaced = replacement
      reset()
      onReplaced(replaced)
      onClose()
    } catch (cause) {
      setError(
        describeAliasError(
          cause,
          'The new address was created, but it could not be linked. You can find it in your alias list.',
        ),
      )
    } finally {
      setIsConfirming(false)
    }
  }

  if (!alias) {
    return <dialog ref={dialogRef} className="dialog" aria-label="Replace alias" />
  }

  const isBusy = isReserving || isConfirming
  const canConfirm = replacement !== null && copyState !== 'idle' && !isBusy

  return (
    <dialog
      ref={dialogRef}
      className="dialog max-w-xl"
      aria-labelledby="replace-alias-title"
      onCancel={(event) => {
        if (isBusy) {
          event.preventDefault()
          return
        }
        handleClose()
      }}
    >
      <div className="dialog__header">
        <h2 id="replace-alias-title" className="text-xl font-bold text-text">
          Kill the leak, keep the service
        </h2>
      </div>

      <div className="dialog__body space-y-4">
        <p>
          Create a fresh address for this service, save it there, then confirm. The old address
          stops forwarding as soon as the replacement is linked.
        </p>

        {step === 'reserve' && (
          <div className="rounded-xl border border-hairline bg-surface-sunken p-4 text-sm">
            <p className="font-semibold text-text">Reserve the new address and copy it.</p>
            <p className="mt-1 text-text-muted">
              You’ll get the real address first so you can save it before the old one is retired.
            </p>
          </div>
        )}

        {step === 'confirm' && replacement && (
          <div className="space-y-3">
            <div className="rounded-xl border border-primary-border bg-primary-surface p-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                New address
              </p>
              <div className="mt-2 flex flex-wrap items-start gap-2">
                <code ref={addressRef} className="min-w-0 flex-1 break-all text-sm text-text">
                  {replacement.fullAddress ?? 'Address pending'}
                </code>
                {replacement.fullAddress && (
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
                )}
              </div>
              {copyState === 'manual' && (
                <p className="mt-2 text-xs text-text-muted">
                  The address is selected, so use your keyboard to copy it.
                </p>
              )}
            </div>

            {copyState === 'idle' && (
              <p className="flex items-start gap-2 text-sm text-text-muted">
                <IconAlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
                <span>Copy the address before confirming, so you don’t lose it.</span>
              </p>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      <div className="dialog__footer">
        <button type="button" className="btn btn--secondary" onClick={handleClose} disabled={isBusy}>
          Cancel
        </button>
        {step === 'reserve' ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void reserveAddress()}
            disabled={isBusy}
            aria-busy={isReserving || undefined}
          >
            {isReserving ? 'Reserving…' : 'Reserve new address'}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void confirmReplace()}
            disabled={!canConfirm}
            aria-busy={isConfirming || undefined}
          >
            {isConfirming ? 'Linking…' : 'Confirm replacement'}
          </button>
        )}
      </div>
    </dialog>
  )
}
