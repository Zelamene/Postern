import { IconEyeOff } from '../common/Icons'
import type { BlockedMessage } from '../../services/activityService'
import type { Alias } from '../../services/aliasService'
import { formatDateTime } from '../../services/formatters'
import type { ActivityFeed } from '../../hooks/useActivity'

interface BlockedActivityProps {
  aliases: Alias[]
  feed: ActivityFeed<BlockedMessage>
}

export function BlockedActivity({ aliases, feed }: Readonly<BlockedActivityProps>) {
  const labels = new Map(
    aliases.map((alias) => [alias.id, alias.label ?? alias.fullAddress ?? 'alias']),
  )

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Blocked mail</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">Blocked messages</h1>
        <p className="mt-2 max-w-prose text-sm text-text-muted">
          Messages Postern refused to forward because the sender was blocked or failed the
          forwarding rules for the alias.
        </p>
      </div>

      <section
        className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm"
        aria-label="Blocked messages"
      >
        {feed.status === 'loading' && (
          <div
            className="space-y-3 p-5 sm:p-6"
            role="status"
            aria-busy="true"
            aria-label="Loading blocked mail"
          >
            <div className="skeleton skeleton--line-lg" />
            <div className="skeleton skeleton--line" />
            <div className="skeleton skeleton--line" />
          </div>
        )}

        {feed.status === 'error' && (
          <p role="alert" className="p-5 text-sm text-danger sm:p-6">
            {feed.error ?? 'Blocked mail could not be loaded.'}
          </p>
        )}

        {feed.status === 'ready' && feed.items.length === 0 && (
          <div className="empty">
            <span className="empty__art" aria-hidden="true">
              <IconEyeOff size={22} />
            </span>
            <p className="empty__title">Nothing blocked</p>
            <p className="empty__body">
              When Postern stops a message, it is listed here with the reason.
            </p>
          </div>
        )}

        {feed.items.length > 0 && (
          <>
            <ul className="divide-y divide-hairline">
              {feed.items.map((message) => (
                <li key={message.id} className="px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="break-all text-sm font-semibold">{message.fromHeader}</p>
                    <p className="text-xs text-text-muted">
                      {formatDateTime(message.receivedAt)}
                    </p>
                  </div>
                  <p className="mt-1 break-words text-sm text-text-secondary">
                    {message.subject?.trim() || 'No subject'}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    <span className="inline-flex rounded-full bg-danger-surface px-2 py-0.5 font-bold text-danger-on-surface">
                      {message.reason}
                    </span>
                    <span>{labels.get(message.aliasId) ?? 'Unknown alias'}</span>
                  </div>
                </li>
              ))}
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
    </div>
  )
}
