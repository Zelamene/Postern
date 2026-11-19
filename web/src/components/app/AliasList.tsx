import { useEffect, useState } from 'react'
import { ConfirmationDialog } from '../common/ConfirmationDialog'
import { IconInbox } from '../common/Icons'
import { useToast } from '../common/toast'
import type { Alias, AliasStatus } from '../../types'
import { copyText, selectText } from '../../services/clipboard'
import { formatDate } from '../../services/formatters'
import { ALIAS_DELETE_RETENTION } from '../../services/productCopy'
import { AppLink } from './AppLink'

const STATUS_CHIP_CLASSES: Record<AliasStatus, string> = {
  Active: 'ea-chip ea-chip--success',
  Disabled: 'ea-chip ea-chip--muted',
  Replaced: 'ea-chip ea-chip--neutral',
  Deleted: 'ea-chip ea-chip--muted',
}

interface AliasListProps {
  aliases: Alias[]
  status: 'loading' | 'ready' | 'error'
  loadError: string | null
  actionError: string | null
  pendingAliasId: string | null
  onReload: () => void
  onDisable: (aliasId: string) => Promise<boolean>
  onDelete: (aliasId: string) => Promise<boolean>
  onDismissError: () => void
}

type PendingAction = { kind: 'disable' | 'delete'; alias: Alias }

function deleteMatch(alias: Alias): { label: string; expected: string; hint: string } {
  const address = alias.fullAddress
  if (address) {
    return {
      label: `Type ${address} to confirm`,
      expected: address,
      hint: 'This confirms you are retiring the right address.',
    }
  }

  return {
    label: 'Type DELETE to confirm',
    expected: 'DELETE',
    hint: 'This confirms you want to retire this alias.',
  }
}

export function AliasList({
  aliases,
  status,
  loadError,
  actionError,
  pendingAliasId,
  onReload,
  onDisable,
  onDelete,
  onDismissError,
}: Readonly<AliasListProps>) {
  const toast = useToast()
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [copiedAliasId, setCopiedAliasId] = useState<string | null>(null)

  useEffect(() => {
    if (copiedAliasId === null) {
      return
    }

    const timer = window.setTimeout(() => setCopiedAliasId(null), 2000)
    return () => window.clearTimeout(timer)
  }, [copiedAliasId])

  async function copyAddress(alias: Alias, target: HTMLElement | null) {
    const address = alias.fullAddress
    if (!address) {
      return
    }

    if (await copyText(address)) {
      setCopiedAliasId(alias.id)
      toast.success('Alias address copied.')
      return
    }

    selectText(target)
    toast.error('Could not copy automatically. The address is selected for manual copy.')
  }

  async function confirmPendingAction() {
    if (!pendingAction) {
      return
    }

    const { kind, alias } = pendingAction
    const ok = kind === 'disable' ? await onDisable(alias.id) : await onDelete(alias.id)
    setPendingAction(null)
    if (ok && kind === 'delete') {
      toast.success('Alias deleted.')
    }
  }

  const isBusy = pendingAliasId !== null
  const pendingDelete = pendingAction?.kind === 'delete' ? pendingAction.alias : null

  return (
    <>
      <section
        className="ea-alias-section"
        aria-labelledby="alias-list-title"
      >
        <div className="ea-section-head">
          <div className="min-w-0">
            <h2 id="alias-list-title" className="ea-section-title">
              All aliases
            </h2>
            <p className="ea-hint">Every address, its status, and its next action in one place.</p>
          </div>
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={onReload}
            disabled={status === 'loading'}
          >
            {status === 'loading' ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {actionError && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3 sm:px-6">
            <p role="alert" className="text-sm text-danger">
              {actionError}
            </p>
            <button type="button" className="btn btn--ghost btn--sm" onClick={onDismissError}>
              Dismiss
            </button>
          </div>
        )}

        {status === 'loading' && aliases.length === 0 && (
          <div
            className="space-y-3 p-5 sm:p-6"
            role="status"
            aria-busy="true"
            aria-label="Loading aliases"
          >
            <div className="skeleton skeleton--line-lg" />
            <div className="skeleton skeleton--line" />
            <div className="skeleton skeleton--line" />
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-3 p-5 sm:p-6">
            <p role="alert" className="text-sm text-danger">
              {loadError ?? 'Your aliases could not be loaded. Refresh to try again.'}
            </p>
            <button type="button" className="btn btn--secondary btn--sm" onClick={onReload}>
              Try again
            </button>
          </div>
        )}

        {status === 'ready' && aliases.length === 0 && (
          <div className="empty">
            <span className="empty__art" aria-hidden="true">
              <IconInbox size={22} />
            </span>
            <p className="empty__title">No aliases yet</p>
            <p className="empty__body">
              Use Create an alias to add your first address, then hand it to a service instead of
              your real address.
            </p>
          </div>
        )}

        {aliases.length > 0 && (
          <>
            <div className="ea-alias-legend" aria-hidden="true">
              <span>Alias</span>
              <span>Address</span>
              <span>Status</span>
              <span>Created</span>
              <span>Actions</span>
            </div>
            <ul className="ea-alias-grid">
              {aliases.map((alias) => {
                const label = alias.label ?? 'default'
                const isRetired = alias.status === 'Replaced' || alias.status === 'Deleted'
                return (
                  <li
                    key={alias.id}
                    className={`ea-alias-row${isRetired ? ' ea-alias-row--retired' : ''}`}
                  >
                    <div className="ea-alias-identity">
                      <h3 className="ea-alias-label capitalize">{label}</h3>
                      {alias.category && (
                        <span className="ea-alias-category">Category: {alias.category}</span>
                      )}
                    </div>

                    <div className="ea-alias-address">
                      <code className={isRetired ? 'line-through' : undefined}>
                        {alias.fullAddress ?? 'Address pending'}
                      </code>
                      {alias.fullAddress ? (
                        <button
                          type="button"
                          className="ea-copy"
                          data-tip={copiedAliasId === alias.id ? 'Copied' : 'Copy address'}
                          aria-label={`Copy address for ${label}`}
                          onClick={(event) => {
                            const code = event.currentTarget.parentElement?.querySelector('code')
                            void copyAddress(alias, code instanceof HTMLElement ? code : null)
                          }}
                        >
                          {copiedAliasId === alias.id ? 'Copied' : 'Copy'}
                        </button>
                      ) : (
                        <span className="ea-hint">Pending</span>
                      )}
                    </div>

                    <span className={STATUS_CHIP_CLASSES[alias.status]}>{alias.status}</span>

                    <span className="ea-alias-created">
                      <span className="ea-alias-meta-label">Created</span>
                      <time className="ea-mono" dateTime={alias.createdAt}>
                        {formatDate(alias.createdAt)}
                      </time>
                    </span>

                    <div className="ea-alias-actions">
                      <AppLink
                        to={`/app/aliases/${alias.id}`}
                        className="btn btn--secondary btn--sm"
                      >
                        Activity
                      </AppLink>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={isBusy || alias.status !== 'Active'}
                        onClick={() => setPendingAction({ kind: 'disable', alias })}
                      >
                        Disable
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        disabled={isBusy || alias.status === 'Deleted'}
                        onClick={() => setPendingAction({ kind: 'delete', alias })}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>

      <ConfirmationDialog
        open={pendingAction?.kind === 'disable'}
        title="Disable this alias?"
        description={
          pendingAction
            ? `Mail sent to ${pendingAction.alias.fullAddress ?? 'this address'} will stop being forwarded. The address stays reserved, but it stops delivering.`
            : ''
        }
        confirmLabel="Disable alias"
        cancelLabel="Keep alias"
        busyLabel="Disabling…"
        busy={isBusy}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => void confirmPendingAction()}
      />

      <ConfirmationDialog
        open={pendingDelete !== null}
        title="Delete this alias?"
        description={
          pendingDelete
            ? `${ALIAS_DELETE_RETENTION} Address: ${pendingDelete.fullAddress ?? 'this address'}.`
            : ALIAS_DELETE_RETENTION
        }
        confirmLabel="Delete alias"
        cancelLabel="Keep alias"
        busyLabel="Deleting…"
        busy={isBusy}
        confirmMatch={pendingDelete ? deleteMatch(pendingDelete) : undefined}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => void confirmPendingAction()}
      />
    </>
  )
}
