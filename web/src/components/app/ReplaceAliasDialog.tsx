import { useEffect, useId, useRef, useState } from 'react'
import {
  createAlias,
  deleteAlias,
  linkReplacement,
} from '../../services/aliasService'
import { DEFAULT_ALIAS_CATEGORY } from '../../constants/aliases'
import type { Alias } from '../../types'
import { copyText, selectText } from '../../services/clipboard'
import { describeAliasError } from '../../services/aliasErrors'
import { IconAlertTriangle, IconCopy, IconCheck } from '../common/Icons'
import { useToast } from '../common/toast'

type Step = 'reserve' | 'confirm'
type CopyState = 'idle' | 'copied' | 'manual'

interface ChecklistItemProps {
  step: number
  done: boolean
  label: string
  state: string
  children?: React.ReactNode
}

function ChecklistItem({ step, done, label, state, children }: Readonly<ChecklistItemProps>) {
  return (
    <li className="ea-checklist__item">
      <span
        className={`ea-checklist__marker${done ? ' ea-checklist__marker--done' : ''}`}
        aria-hidden="true"
      >
        {done ? <IconCheck size={14} /> : step}
      </span>
      <div className="ea-checklist__body">
        <div className="ea-checklist__row">
          <p className="ea-checklist__title">{label}</p>
          <span className="ea-checklist__state">{done ? 'Complete' : state}</span>
        </div>
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
      className="dialog"
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
        <h2 id="replace-alias-title" className="ea-dialog__title">
          Kill the leak, keep the service
        </h2>
      </div>

      <div className="dialog__body">
        <p className="ea-dialog__intro">
          Create a fresh address for this service, save it there, then confirm. The old address
          stops forwarding as soon as the replacement is linked.
        </p>

        <div className="ea-transition">
          <div>
            <span className="ea-transition__label">Current address</span>
            <p className="ea-transition__title">Retired on confirmation</p>
            <p className="ea-transition__address ea-transition__address--retired">
              {alias.fullAddress ?? 'Address pending'}
            </p>
            <p className="ea-transition__note">
              Mail sent here stops forwarding when the replacement is linked.
            </p>
          </div>
          <div>
            <span className="ea-transition__label">Replacement</span>
            <p className="ea-transition__title">Ready to save</p>
            <p className="ea-transition__address ea-transition__address--new">
              {hasReservedAddress ? 'Reserved — copy it below' : 'Not reserved yet'}
            </p>
            <p className="ea-transition__note">
              The new entry keeps this alias’s label and category.
            </p>
          </div>
        </div>

        <h3 className="ea-section-title">Replacement checklist</h3>
        <p className="ea-hint">Perform each action deliberately before linking the replacement.</p>

        <ol className="ea-checklist" aria-label="Replacement checklist">
          <ChecklistItem
            step={1}
            done={hasReservedAddress}
            state="Required"
            label="Reserve a new address for this service."
          >
            {!hasReservedAddress ? (
              <p>
                Get the real address first so you can save it before the old one is retired.
              </p>
            ) : (
              <p>A fresh address is ready to copy below.</p>
            )}
          </ChecklistItem>

          <ChecklistItem
            step={2}
            done={hasCopiedAddress}
            state={hasReservedAddress ? 'Required' : 'Waiting'}
            label="Copy or save the new address."
          >
            {hasReservedAddress && replacement?.fullAddress && (
              <div className="ea-checklist__address">
                <code ref={addressRef} className="min-w-0 flex-1">
                  {replacement.fullAddress}
                </code>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  onClick={() => void copyAddress()}
                >
                  {copyState === 'copied' ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  {copyState === 'copied' ? 'Copied' : 'Copy address'}
                </button>
              </div>
            )}
            {copyState === 'manual' && (
              <p>The address is selected, so use your keyboard to copy it.</p>
            )}
            {hasReservedAddress && !hasCopiedAddress && (
              <p className="ea-checklist__warning">
                <IconAlertTriangle size={16} />
                <span>Copy the address before confirming, so you don’t lose it.</span>
              </p>
            )}
          </ChecklistItem>

          <ChecklistItem
            step={3}
            done={serviceUpdated}
            state={hasReservedAddress ? 'Action' : 'Waiting'}
            label="Update the affected service with the new address."
          >
            <label htmlFor={serviceUpdatedId} className="ea-checklist__confirm">
              <input
                id={serviceUpdatedId}
                type="checkbox"
                checked={serviceUpdated}
                onChange={(event) => setServiceUpdated(event.target.checked)}
                disabled={!hasReservedAddress || isBusy}
              />
              <span>I’ve updated the service and saved the new address where needed.</span>
            </label>
          </ChecklistItem>

          <ChecklistItem
            step={4}
            done={false}
            state="Pending"
            label="Confirm replacement to retire the old address."
          >
            <p>
              Confirm only after the checklist above is complete. The old address stops forwarding
              when the replacement is linked.
            </p>
          </ChecklistItem>
        </ol>

        {error && (
          <p role="alert" className="ea-notice ea-notice--error ea-notice--inline">
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
