import { useEffect, useRef, useState } from 'react'
import { ConfirmationDialog } from '../common/ConfirmationDialog'
import { IconCopy, IconInbox } from '../common/Icons'
import type { Alias } from '../../services/aliasService'
import { formatDate } from '../../services/formatters'
import { AppLink } from './AppLink'
import { ALIAS_STATUS_CLASSES } from './aliasStatus'

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
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [copiedAliasId, setCopiedAliasId] = useState<string | null>(null)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (copiedTimer.current !== null) {
        clearTimeout(copiedTimer.current)
      }
    },
    [],
  )

  async function copyAddress(alias: Alias) {
    if (!alias.fullAddress) {
      return
    }

    try {
      await navigator.clipboard.writeText(alias.fullAddress)
      setCopiedAliasId(alias.id)
      if (copiedTimer.current !== null) {
        clearTimeout(copiedTimer.current)
      }

      copiedTimer.current = setTimeout(() => setCopiedAliasId(null), 2000)
    } catch (error) {
      console.error('Unable to copy the alias address', error)
    }
  }

  const isBusy = pendingAliasId !== null

  return (
    <>
      <section
        className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm"
        aria-labelledby="alias-list-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-4 sm:px-6">
          <div>
            <h2 id="alias-list-title" className="text-xl font-bold">
              All aliases
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Open an alias to review the mail it has received.
            </p>
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
              Create your first alias above, then hand it to a service instead of your real
              address.
            </p>
          </div>
        )}

        {aliases.length > 0 && (
          <ul className="divide-y divide-hairline">
            {aliases.map((alias) => {
              const label = alias.label ?? 'default'
              return (
                <li
                  key={alias.id}
                  className="grid gap-3 px-5 py-4 sm:px-6 md:grid-cols-[minmax(0,1fr)_6.5rem_8rem_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <p className="font-semibold capitalize">{label}</p>
                    <div className="mt-0.5 flex items-start gap-1.5">
                      <code className="break-all text-xs text-text-muted">
                        {alias.fullAddress ?? 'Address pending'}
                      </code>
                      {alias.fullAddress && (
                        <button
                          type="button"
                          className="tip inline-flex size-6 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-tint hover:text-primary"
                          data-tip={copiedAliasId === alias.id ? 'Copied' : 'Copy address'}
                          aria-label={`Copy address for ${label}`}
                          onClick={() => void copyAddress(alias)}
                        >
                          <IconCopy size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${ALIAS_STATUS_CLASSES[alias.status]}`}
                    >
                      {alias.status}
                    </span>
                  </div>

                  <p className="text-xs text-text-muted md:text-sm">
                    Created {formatDate(alias.createdAt)}
                  </p>

                  <div className="flex flex-wrap gap-2 md:justify-end">
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
        onConfirm={() => {
          if (!pendingAction) {
            return
          }

          const aliasId = pendingAction.alias.id
          setPendingAction(null)
          void onDisable(aliasId)
        }}
      />

      <ConfirmationDialog
        open={pendingAction?.kind === 'delete'}
        title="Delete this alias?"
        description={
          pendingAction
            ? `Mail sent to ${pendingAction.alias.fullAddress ?? 'this address'} will stop being forwarded, and the address is retired permanently.`
            : ''
        }
        confirmLabel="Delete alias"
        cancelLabel="Keep alias"
        busyLabel="Deleting…"
        busy={isBusy}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          if (!pendingAction) {
            return
          }

          const aliasId = pendingAction.alias.id
          setPendingAction(null)
          void onDelete(aliasId)
        }}
      />
    </>
  )
}
