import { useEffect, useId, useRef, useState } from 'react'
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

interface ChecklistItemProps {
  done: boolean
  label: string
  children?: React.ReactNode
}

function ChecklistItem({ done, label, children }: Readonly<ChecklistItemProps>) {
  return (
    <li className="flex items-start gap-3 text-sm">
      <span
        className={
          done
            ? 'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary'
            : 'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface text-text-muted'
        }
        aria-hidden="true"
      >
        {done ? <IconCheck size={12} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className={done ? 'font-medium text-text' : 'text-text'}>{label}</p>
        {children}
      </div>
    </li>
  )
}

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
  const serviceUpdatedId = useId()
  const [step, setStep] = useState<Step>('reserve')
  const [replacement, setReplacement] = useState<Alias | null>(null)
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const [serviceUpdated, setServiceUpdated] = useState(false)
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
    setServiceUpdated(false)
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
    if (!alias || !replacement || isConfirming || copyState === 'idle' || !serviceUpdated) {
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
  const hasReservedAddress = replacement !== null && step === 'confirm'
  const hasCopiedAddress = copyState !== 'idle'
  const canConfirm = hasReservedAddress && hasCopiedAddress && serviceUpdated && !isBusy

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

        <div className="rounded-xl border border-hairline bg-surface-sunken p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
            Replacement checklist
          </p>
          <ol className="mt-3 space-y-3" aria-label="Replacement checklist">
            <ChecklistItem
              done={hasReservedAddress}
              label="Reserve a new address for this service."
            >
              {!hasReservedAddress && (
                <p className="mt-1 text-text-muted">
                  Get the real address first so you can save it before the old one is retired.
                </p>
              )}
            </ChecklistItem>
            <ChecklistItem done={hasCopiedAddress} label="Copy or save the new address.">
              {hasReservedAddress && replacement?.fullAddress && (
                <div className="mt-2 rounded-lg border border-primary-border bg-primary-surface p-3">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">
                    New address
                  </p>
                  <div className="mt-2 flex flex-wrap items-start gap-2">
                    <code ref={addressRef} className="min-w-0 flex-1 break-all text-sm text-text">
                      {replacement.fullAddress}
                    </code>
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
                  </div>
                  {copyState === 'manual' && (
                    <p className="mt-2 text-xs text-text-muted">
                      The address is selected, so use your keyboard to copy it.
                    </p>
                  )}
                </div>
              )}
              {hasReservedAddress && !hasCopiedAddress && (
                <p className="mt-2 flex items-start gap-2 text-text-muted">
                  <IconAlertTriangle size={16} className="mt-0.5 shrink-0 text-warning" />
                  <span>Copy the address before confirming, so you don’t lose it.</span>
                </p>
              )}
            </ChecklistItem>
            <ChecklistItem
              done={serviceUpdated}
              label="Update the affected service with the new address."
            >
              <label htmlFor={serviceUpdatedId} className="mt-2 flex items-start gap-2 text-text-muted">
                <input
                  id={serviceUpdatedId}
                  type="checkbox"
                  className="mt-1"
                  checked={serviceUpdated}
                  onChange={(event) => setServiceUpdated(event.target.checked)}
                  disabled={!hasReservedAddress || isBusy}
                />
                <span>I’ve updated the service and saved the new address where needed.</span>
              </label>
            </ChecklistItem>
            <ChecklistItem done={false} label="Confirm replacement to retire the old address.">
              <p className="mt-1 text-text-muted">
                Confirm only after the checklist above is complete. The old address stops forwarding
                when the replacement is linked.
              </p>
            </ChecklistItem>
          </ol>
        </div>

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
