import { useEffect, useId, useRef, useState, type SyntheticEvent } from 'react'
import {
  ALIAS_CATEGORIES,
  DEFAULT_ALIAS_CATEGORY,
  isAliasCategory,
} from '../../constants/aliases'
import type { AliasCategory, CreateAliasInput, CreateAliasOutcome } from '../../types'
import { EmailAddressNormalizer } from '../../services/EmailAddressNormalizer'
import { IconAlertTriangle } from '../common/Icons'

const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/
const PREVIEW_SAFE_PATTERN = /[^a-z0-9._-]/g
const MASKED_SUFFIX = '····'
const PLACEHOLDER_LABEL = 'youralias'
const LABEL_ERROR =
  'Use 1–64 lowercase letters, numbers, dots, hyphens or underscores, starting and ending with a letter or number.'
const SENDER_ERROR = 'Enter the sender address or domain, for example orders@shop.example.'

interface AliasComposerProps {
  isCreating: boolean
  error: string | null
  /** Mail domain taken from an existing alias, used only for the preview. */
  existingDomain: string | null
  onCreate: (input: CreateAliasInput) => Promise<CreateAliasOutcome>
  /** Hide the card heading when the composer is hosted inside a dialog. */
  showHeading?: boolean
}

export function AliasComposer({
  isCreating,
  error,
  existingDomain,
  onCreate,
  showHeading = true,
}: Readonly<AliasComposerProps>) {
  const [label, setLabel] = useState('')
  const [category, setCategory] = useState<AliasCategory>(DEFAULT_ALIAS_CATEGORY)
  const [expectedSender, setExpectedSender] = useState('')
  const [labelError, setLabelError] = useState<string | null>(null)
  const [senderError, setSenderError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  const labelId = useId()
  const labelHintId = useId()
  const previewId = useId()
  const categoryId = useId()
  const senderId = useId()
  const senderHintId = useId()
  const errorRef = useRef<HTMLParagraphElement>(null)

  const message = labelError ?? senderError ?? error
  const previewLabel =
    label.trim().toLowerCase().replace(PREVIEW_SAFE_PATTERN, '') || PLACEHOLDER_LABEL

  useEffect(() => {
    if (message) {
      errorRef.current?.focus()
    }
  }, [message])

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isCreating) {
      return
    }

    const candidate = label.trim().toLowerCase()
    const sender = expectedSender.trim()
    const nextLabelError = LABEL_PATTERN.test(candidate) ? null : LABEL_ERROR
    const nextSenderError =
      !sender || EmailAddressNormalizer.IsValidSender(sender) ? null : SENDER_ERROR
    if (nextLabelError || nextSenderError) {
      setLabelError(nextLabelError)
      setSenderError(nextSenderError)
      return
    }

    setLabelError(null)
    setSenderError(null)
    setWarning(null)

    const outcome = await onCreate({
      label: candidate,
      category,
      expectedSender: sender || null,
    })
    if (!outcome.ok) {
      return
    }

    setWarning(outcome.warning)
    setLabel('')
    setExpectedSender('')
  }

  return (
    <section
      className={showHeading ? 'ea-card ea-card__pad' : 'ea-composer'}
      aria-labelledby={showHeading ? `${labelId}-title` : undefined}
    >
      {showHeading && (
        <>
          <h2 id={`${labelId}-title`} className="ea-card__title">
            Create an alias
          </h2>
          <p className="ea-lede">
            Name it after the service you are signing up for. Postern adds a random suffix so the
            address stays unguessable.
          </p>
        </>
      )}

      <form className="ea-composer__grid" onSubmit={handleSubmit}>
        <div className="ea-field">
          <label htmlFor={labelId} className="ea-label">
            Label
          </label>
          <input
            id={labelId}
            type="text"
            className="input w-full"
            value={label}
            onChange={(event) => {
              setLabel(event.target.value)
              setLabelError(null)
            }}
            placeholder="newsletter"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
            disabled={isCreating}
            aria-describedby={`${labelHintId} ${previewId}`}
            aria-invalid={labelError ? true : undefined}
          />
          <p id={labelHintId} className="ea-hint">
            Lowercase letters, numbers, dots, hyphens and underscores only.
          </p>
        </div>

        <div className="ea-field">
          <label htmlFor={categoryId} className="ea-label">
            Category
          </label>
          <select
            id={categoryId}
            className="select w-full"
            value={category}
            onChange={(event) => {
              if (isAliasCategory(event.target.value)) {
                setCategory(event.target.value)
              }
            }}
            disabled={isCreating}
          >
            {ALIAS_CATEGORIES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <p className="ea-hint">Groups aliases so you can find them later.</p>
        </div>

        <div className="ea-field ea-field--wide">
          <label htmlFor={senderId} className="ea-label">
            Expected sender <span className="font-normal text-outline">(optional)</span>
          </label>
          <input
            id={senderId}
            type="text"
            className="input w-full"
            value={expectedSender}
            onChange={(event) => {
              setExpectedSender(event.target.value)
              setSenderError(null)
            }}
            onBlur={() => {
              const sender = expectedSender.trim()
              setSenderError(
                !sender || EmailAddressNormalizer.IsValidSender(sender) ? null : SENDER_ERROR,
              )
            }}
            placeholder="orders@shop.example"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            disabled={isCreating}
            aria-describedby={senderHintId}
            aria-invalid={senderError ? true : undefined}
          />
          <p id={senderHintId} className="ea-hint">
            The address or domain this service writes from. Mail from it is never flagged.
          </p>
        </div>

        <div className="ea-field ea-field--wide" id={previewId}>
          <div className="ea-preview">
            <p className="ea-section-note">Generated address preview</p>
            <code className="mt-1 block break-all text-sm">
              {previewLabel}.{MASKED_SUFFIX}
              {existingDomain ? `@${existingDomain}` : ''}
            </code>
            <p className="ea-hint">
              {existingDomain
                ? 'The dots stand in for the random suffix Postern adds when you save.'
                : 'Postern fills in the rest of the address when you save.'}
            </p>
          </div>
        </div>

        <div className="ea-field ea-field--wide">
          <button
            type="submit"
            className="btn btn--primary"
            disabled={isCreating}
            aria-busy={isCreating || undefined}
          >
            {isCreating ? 'Creating…' : 'Create alias'}
          </button>
        </div>
      </form>

      {message && (
        <p ref={errorRef} role="alert" tabIndex={-1} className="mt-3 text-sm text-danger">
          {message}
        </p>
      )}

      {warning && (
        <p role="status" className="alert alert--warning mt-3">
          <IconAlertTriangle className="alert__icon" />
          <span>{warning}</span>
        </p>
      )}
    </section>
  )
}
