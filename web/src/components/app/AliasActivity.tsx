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
import { ALIAS_STATUS_CLASSES } from './aliasStatus'
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
    tone: 'bg-danger-surface text-danger-on-surface',
    description: 'Failed authentication',
  },
  medium: {
    label: 'Medium severity',
    tone: 'bg-warning-surface text-warning-on-surface',
    description: 'Unexpected sender',
  },
  low: {
    label: 'Low severity',
    tone: 'bg-surface-sunken text-text-muted',
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
      return 'bg-success-surface text-success-on-surface'
    case 'fail':
      return 'bg-danger-surface text-danger-on-surface'
    case 'none':
      return 'bg-surface-sunken text-text-muted'
    default:
      return 'bg-warning-surface text-warning-on-surface'
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

  return (
    <div className="space-y-6">
      <div>
        <AppLink to="/app" className="text-sm font-semibold no-underline">
          ← All aliases
        </AppLink>
        <p className="mt-4 text-xs font-bold tracking-[0.16em] text-primary uppercase">
          Alias activity
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight capitalize">{title}</h1>
          {alias && (
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${ALIAS_STATUS_CLASSES[alias.status]}`}
            >
              {alias.status}
            </span>
          )}
        </div>
        {address && <code className="mt-2 block break-all text-sm text-text-muted">{address}</code>}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="max-w-prose text-sm text-text-muted">
            Postern keeps message metadata for this address. Bodies are never stored.
          </p>
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
              className="btn btn--secondary btn--sm"
              onClick={() => setIsReplaceOpen(true)}
            >
              Replace address
            </button>
          )}
        </div>
        <p className="mt-2 max-w-prose text-sm text-text-secondary">{REPLY_WARNING}</p>
      </div>

      {notice && (
        <p role="status" className="alert alert--success">
          <IconCheckCircle className="alert__icon" />
          <span>{notice}</span>
        </p>
      )}

      {actionError && (
        <p role="alert" className="alert alert--danger">
          <IconAlertTriangle className="alert__icon" />
          <span>{actionError}</span>
        </p>
      )}

      <section
        className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm"
        aria-label={`Messages received by ${title}`}
      >
        {feed.status === 'loading' && (
          <output
            className="space-y-3 p-5 sm:p-6"
            aria-busy="true"
            aria-label="Loading messages"
          >
            <div className="skeleton skeleton--line-lg" />
            <div className="skeleton skeleton--line" />
            <div className="skeleton skeleton--line" />
          </output>
        )}

        {feed.status === 'error' && (
          <p role="alert" className="p-5 text-sm text-danger sm:p-6">
            {feed.error ?? 'This activity could not be loaded.'}
          </p>
        )}

        {feed.status === 'ready' && feed.items.length === 0 && (
          <div className="empty">
            <span className="empty__art" aria-hidden="true">
              <IconMail size={22} />
            </span>
            <p className="empty__title">No mail yet</p>
            <p className="empty__body">
              Once a sender writes to this alias, the message header appears here.
            </p>
          </div>
        )}

        {feed.items.length > 0 && (
          <>
            <ul className="divide-y divide-hairline">
              {feed.items.map((message) => {
                const sender = senderOf(message)
                const senderAddress = senderAddressOf(message)
                const severity = leakSeverity(message)
                const severityDetail = severity ? SEVERITY_DETAILS[severity] : null
                const showLeakActions = message.isFlagged && alias?.status === 'Active'

                return (
                  <li key={message.id} className="px-5 py-4 sm:px-6">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="break-all text-sm font-semibold">
                        {message.fromHeader || message.envelopeSender}
                      </p>
                      <p className="text-xs text-text-muted">
                        {formatDateTime(message.receivedAt)}
                      </p>
                    </div>
                    <p className="mt-1 break-words text-sm text-text-secondary">
                      {message.subject?.trim() || 'No subject'}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${authTone(message.authenticationResult)}`}
                      >
                        {message.authenticationResult || 'unknown'} authentication
                      </span>
                      {severityDetail && (
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${severityDetail.tone}`}
                          title={message.flagReason ?? undefined}
                        >
                          {severityDetail.label} · {severityDetail.description}
                        </span>
                      )}
                      {showLeakActions && (
                        <span className="ml-auto flex flex-wrap gap-1">
                          {sender !== null && (
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              disabled={pendingMessageId === message.id}
                              aria-label={`Mark ${sender} as expected`}
                              onClick={() =>
                                void handleSenderAction(message.id, sender, 'expected', senderAddress)
                              }
                            >
                              Mark as expected
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            disabled={pendingMessageId === message.id}
                            aria-label="Replace this alias"
                            onClick={() => setIsReplaceOpen(true)}
                          >
                            Replace alias
                          </button>
                          {sender !== null && (
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              disabled={pendingMessageId === message.id}
                              aria-label={`Block ${sender}`}
                              onClick={() => handleBlockRequest(message.id, sender, senderAddress)}
                            >
                              Block sender
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>

            {feed.hasMore && (
              <div className="border-t border-hairline px-5 py-3 sm:px-6">
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
