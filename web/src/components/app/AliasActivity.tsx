import { useState } from 'react'
import { IconAlertTriangle, IconCheckCircle, IconMail } from '../common/Icons'
import type { ActivityFeed, Alias, MailMessage } from '../../types'
import { blockSender, markExpectedSender } from '../../services/aliasService'
import { EmailAddressNormalizer } from '../../services/EmailAddressNormalizer'
import { ApiError } from '../../services/apiClient'
import { describeAliasError } from '../../services/aliasErrors'
import { REPLY_WARNING } from '../../services/productCopy'
import { isPublicEmailProvider } from '../../services/publicEmailProviders'
import { formatDateTime } from '../../services/formatters'
import { AppLink } from './AppLink'
import { ConfirmationDialog } from '../common/ConfirmationDialog'
import { ReplaceAliasDialog } from './ReplaceAliasDialog'
import { useToast } from '../common/toast'
import { exportAliasActivityCsv } from '../../services/activityExport'

type SenderAction = 'expected' | 'block'

interface AliasActivityProps {
  alias: Alias | null
  feed: ActivityFeed<MailMessage>
  onAliasReplaced: (aliasId: string, replacement: Alias) => void
}

type LeakSeverity = 'high' | 'medium' | 'low'

const SEVERITY_DETAILS: Record<LeakSeverity, { label: string; tone: string; description: string }> = {
  high: {
    label: 'High severity',
    tone: 'ea-chip--danger',
    description: 'Failed authentication',
  },
  medium: {
    label: 'Medium severity',
    tone: 'ea-chip--accent',
    description: 'Unexpected sender',
  },
  low: {
    label: 'Low severity',
    tone: 'ea-chip--muted',
    description: 'Unverified sender',
  },
}

function leakSeverity(message: MailMessage): LeakSeverity | null {
  if (!message.isFlagged) {
    return null
  }

  switch (message.flagReason) {
    case 'fail':
      return 'high'
    case 'unexpected_pass':
      return 'medium'
    case 'unexpected_none':
    case 'none':
    case 'unknown':
    default:
      return 'low'
  }
}

function authTone(result: string): string {
  switch (result.toLowerCase()) {
    case 'pass':
      return 'ea-chip--success'
    case 'fail':
      return 'ea-chip--danger'
    case 'none':
      return 'ea-chip--muted'
    default:
      return 'ea-chip--accent'
  }
}

function senderOf(message: MailMessage): string | null {
  return (
    EmailAddressNormalizer.SenderHost(message.fromHeader) ??
    EmailAddressNormalizer.SenderHost(message.envelopeSender)
  )
}

function senderAddressOf(message: MailMessage): string | null {
  return (
    EmailAddressNormalizer.SenderAddress(message.fromHeader ?? '') ??
    EmailAddressNormalizer.SenderAddress(message.envelopeSender ?? '')
  )
}

function describeSenderError(error: unknown): string {
  if (error instanceof ApiError && error.status === 400) {
    return 'That sender address cannot be used. Check the address and try again.'
  }

  return describeAliasError(
    error,
    'The sender could not be updated. Check your connection and try again.',
  )
}

export function AliasActivity({ alias, feed, onAliasReplaced }: Readonly<AliasActivityProps>) {
  const toast = useToast()
  const [isReplaceOpen, setIsReplaceOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingMessageId, setPendingMessageId] = useState<string | null>(null)
  const [pendingBlock, setPendingBlock] = useState<{
    messageId: string
    domain: string
    address: string | null
  } | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const title = alias?.label ?? 'Alias activity'
  const address = alias?.fullAddress ?? ''
  const canReplace = alias?.status === 'Active'

  async function handleSenderAction(
    messageId: string,
    sender: string,
    action: SenderAction,
    senderAddress?: string | null,
  ) {
    if (!alias) {
      return
    }

    setPendingMessageId(messageId)
    setActionError(null)
    setNotice(null)

    try {
      if (action === 'expected') {
        await markExpectedSender(alias.id, sender, senderAddress)
        setNotice('Sender marked as expected. Its mail is no longer flagged.')
      } else {
        await blockSender(alias.id, sender)
        setNotice(`Sender blocked. New mail from ${sender} is dropped for this alias.`)
      }
    } catch (error) {
      setActionError(describeSenderError(error))
    } finally {
      setPendingMessageId(null)
    }
  }

  function handleBlockRequest(messageId: string, sender: string, senderAddress: string | null) {
    if (isPublicEmailProvider(sender)) {
      setPendingBlock({ messageId, domain: sender, address: senderAddress })
      return
    }

    void handleSenderAction(messageId, sender, 'block')
  }

  async function handleConfirmedBlock() {
    if (pendingBlock === null) {
      return
    }

    await handleSenderAction(pendingBlock.messageId, pendingBlock.domain, 'block')
    setPendingBlock(null)
  }

  function handleReplaced(replacement: Alias) {
    if (alias) {
      onAliasReplaced(alias.id, replacement)
    }

    setNotice(
      'The new address is live. Update it at the service, then the old address stops delivering.',
    )
  }

  async function handleExport() {
    if (!alias || isExporting) {
      return
    }

    setIsExporting(true)

    try {
      const result = await exportAliasActivityCsv(alias.id, alias.label ?? alias.fullAddress ?? 'alias')
      if (result.limited) {
        toast.error('Export limited to the first 5,000 messages.')
        return
      }

      toast.success('Activity exported.')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return
      }

      toast.error('The export could not be completed. Try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const loadedMessages = feed.items
  const flaggedCount = loadedMessages.filter((message) => message.isFlagged).length

  return (
    <div className="ea-stack">
      <div>
        <AppLink to="/app" className="ea-back">
          <span aria-hidden="true">←</span> All aliases
        </AppLink>
        <div className="ea-hero ea-hero--tight">
          <div>
            <div className="ea-hero__actions">
              <h1 className="ea-title ea-title--md capitalize">{title}</h1>
              {alias && (
                <span className="ea-chip ea-chip--neutral">{alias.status}</span>
              )}
            </div>
            {address && (
              <div className="ea-address ea-address--hero">
                <code>{address}</code>
              </div>
            )}
            <p className="ea-lede">
              Postern keeps message metadata for this address. Bodies are never stored.
            </p>
            <p className="ea-hint">{REPLY_WARNING}</p>
          </div>
          <div className="ea-hero__actions">
            {alias && (
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => void handleExport()}
                disabled={isExporting}
                aria-busy={isExporting || undefined}
              >
                {isExporting ? 'Exporting…' : 'Export CSV'}
              </button>
            )}
            {canReplace && (
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => setIsReplaceOpen(true)}
              >
                Replace address
              </button>
            )}
          </div>
        </div>
      </div>

      {notice && (
        <p role="status" className="ea-notice">
          <IconCheckCircle size={18} />
          <span>{notice}</span>
        </p>
      )}

      {actionError && (
        <p role="alert" className="ea-notice ea-notice--error">
          <IconAlertTriangle size={18} />
          <span>{actionError}</span>
        </p>
      )}

      <section className="ea-stack" aria-label={`Messages received by ${title}`}>
        {loadedMessages.length > 0 && (
          <div className="ea-activity-summary" aria-label="Activity summary">
            <span className="ea-activity-summary__item">
              <span className="ea-activity-summary__label">Messages</span>
              <strong>{loadedMessages.length}</strong>
            </span>
            <span className="ea-activity-summary__item">
              <span className="ea-activity-summary__label">Flagged</span>
              <strong className="ea-activity-summary__value--accent">{flaggedCount}</strong>
            </span>
            <span className="ea-activity-summary__item">
              <span className="ea-activity-summary__label">Status</span>
              <strong>{alias?.status ?? '—'}</strong>
            </span>
            <span className="ea-activity-summary__item">
              <span className="ea-activity-summary__label">Latest</span>
              <strong>{formatDateTime(loadedMessages[0].receivedAt)}</strong>
            </span>
          </div>
        )}

        <div>
          <div className="ea-activity-head">
            <h2 className="ea-activity-head__title">Messages</h2>
            <span className="ea-activity-head__note">Metadata records in this view</span>
          </div>

          {feed.status === 'loading' && (
            <output
              className="ea-activity-loading"
              aria-busy="true"
              aria-label="Loading messages"
            >
              <div className="skeleton skeleton--line" />
              <div className="skeleton skeleton--line" />
              <div className="skeleton skeleton--line" />
            </output>
          )}

          {feed.status === 'error' && (
            <p role="alert" className="ea-notice ea-notice--error">
              {feed.error ?? 'This activity could not be loaded.'}
            </p>
          )}

          {feed.status === 'ready' && feed.items.length === 0 && (
            <div className="ea-activity-empty">
              <span className="ea-activity-empty__icon" aria-hidden="true">
                <IconMail size={18} />
              </span>
              <div>
                <p className="ea-activity-empty__title">No mail yet</p>
                <p className="ea-activity-empty__body">
                  Once a sender writes to this alias, the message header appears here.
                </p>
              </div>
            </div>
          )}

          {feed.items.length > 0 && (
            <>
              <ul className="ea-activity-list">
                {feed.items.map((message) => {
                  const sender = senderOf(message)
                  const senderAddress = senderAddressOf(message)
                  const trustLabel = senderAddress ?? sender
                  const isPublicProvider = isPublicEmailProvider(sender)
                  const severity = leakSeverity(message)
                  const severityDetail = severity ? SEVERITY_DETAILS[severity] : null
                  const showLeakActions = message.isFlagged && alias?.status === 'Active'

                  return (
                    <li
                      key={message.id}
                      className={`ea-activity-row${message.isFlagged ? ' ea-activity-row--flagged' : ''}`}
                    >
                      <div className="ea-activity-row__main">
                        <span className="ea-activity-row__avatar" aria-hidden="true">
                          <IconMail size={16} />
                        </span>

                        <div className="ea-activity-row__body">
                          <div className="ea-activity-row__head">
                            <div className="ea-activity-row__identity">
                              <span className="ea-activity-row__sender">
                                {message.fromHeader || message.envelopeSender || 'Unknown sender'}
                              </span>
                              {message.fromHeader && senderAddress && (
                                <span className="ea-activity-row__address">
                                  &lt;{senderAddress}&gt;
                                </span>
                              )}
                            </div>
                            <time className="ea-activity-row__time" dateTime={message.receivedAt}>
                              {formatDateTime(message.receivedAt)}
                            </time>
                          </div>

                          <p className="ea-activity-row__subject">
                            {message.subject?.trim() || 'No subject'}
                          </p>

                          <dl className="ea-activity-row__meta">
                            <div className="ea-activity-row__meta-group">
                              <dt className="ea-activity-row__meta-label">Authentication</dt>
                              <dd className="ea-activity-row__meta-value">
                                <span
                                  className={`ea-chip ${authTone(message.authenticationResult)}`}
                                >
                                  {message.authenticationResult || 'unknown'}
                                </span>
                              </dd>
                            </div>

                            {severityDetail && (
                              <div className="ea-activity-row__meta-group">
                                <dt className="ea-activity-row__meta-label">Assessment</dt>
                                <dd className="ea-activity-row__meta-value">
                                  <span
                                    className={`ea-chip ${severityDetail.tone}`}
                                    title={message.flagReason ?? undefined}
                                  >
                                    {severityDetail.label} · {severityDetail.description}
                                  </span>
                                </dd>
                              </div>
                            )}

                            <div className="ea-activity-row__meta-group ea-activity-row__meta-group--wide">
                              <dt className="ea-activity-row__meta-label">Sender domain</dt>
                              <dd className="ea-activity-row__domain">
                                {sender ? (
                                  <>
                                    <strong className="ea-mono">{sender}</strong>{' '}
                                    {message.isFlagged
                                      ? 'is not on the expected sender list.'
                                      : 'is recorded on this message.'}
                                  </>
                                ) : (
                                  'Sender details were not recorded.'
                                )}
                                {isPublicProvider && message.isFlagged && (
                                  <span className="ea-activity-row__provider">
                                    Public mailbox providers need explicit approval.
                                  </span>
                                )}
                              </dd>
                            </div>
                          </dl>
                        </div>
                      </div>

                      {showLeakActions && (
                        <div className="ea-activity-row__actions">
                          {sender !== null && (
                            <button
                              type="button"
                              className="ea-activity-row__action"
                              disabled={pendingMessageId === message.id}
                              aria-label={`Mark ${trustLabel} as expected`}
                              onClick={() =>
                                void handleSenderAction(
                                  message.id,
                                  sender,
                                  'expected',
                                  senderAddress,
                                )
                              }
                            >
                              Mark {trustLabel} as expected
                            </button>
                          )}
                          <button
                            type="button"
                            className="ea-activity-row__action"
                            disabled={pendingMessageId === message.id}
                            aria-label="Replace this alias"
                            onClick={() => setIsReplaceOpen(true)}
                          >
                            Replace this alias
                          </button>
                          {sender !== null && (
                            <button
                              type="button"
                              className="ea-activity-row__action"
                              disabled={pendingMessageId === message.id}
                              aria-label={`Block ${sender}`}
                              onClick={() =>
                                handleBlockRequest(message.id, sender, senderAddress)
                              }
                            >
                              Block {sender}
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>

              {feed.hasMore && (
                <div className="ea-activity-more">
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => void feed.loadMore()}
                    disabled={feed.isLoadingMore}
                  >
                    {feed.isLoadingMore ? 'Loading…' : 'Load older messages'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <ConfirmationDialog
        open={pendingBlock !== null}
        title={pendingBlock === null ? '' : `Block all mail from @${pendingBlock.domain}?`}
        description={
          pendingBlock === null
            ? ''
            : `This sender uses a public email provider. Blocking ${
                pendingBlock.address ?? pendingBlock.domain
              } also blocks every other address at @${pendingBlock.domain} for this alias, including legitimate mail.`
        }
        confirmLabel={pendingBlock === null ? 'Block' : `Block @${pendingBlock.domain}`}
        cancelLabel="Cancel"
        busyLabel="Blocking…"
        busy={pendingBlock !== null && pendingMessageId === pendingBlock.messageId}
        onCancel={() => setPendingBlock(null)}
        onConfirm={() => void handleConfirmedBlock()}
      />
      <ReplaceAliasDialog
        open={isReplaceOpen}
        alias={alias}
        onClose={() => setIsReplaceOpen(false)}
        onReplaced={handleReplaced}
      />
    </div>
  )
}
