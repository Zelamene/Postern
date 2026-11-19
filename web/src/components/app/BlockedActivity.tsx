import { IconEyeOff } from '../common/Icons'
import type { ActivityFeed, Alias, BlockedMessage } from '../../types'
import { formatDateTime } from '../../services/formatters'
import { blockedReasonLabel } from '../../services/blockedReasons'

interface BlockedActivityProps {
  aliases: Alias[]
  feed: ActivityFeed<BlockedMessage>
}

export function BlockedActivity({ aliases, feed }: Readonly<BlockedActivityProps>) {
  const labels = new Map(
    aliases.map((alias) => [alias.id, alias.label ?? alias.fullAddress ?? 'alias']),
  )

  return (
    <div className="ea-stack">
      <div className="ea-hero">
        <div>
          <h1 className="ea-title ea-title--md">Blocked messages</h1>
          <p className="ea-lede">
            Messages Postern refused to forward because the sender was blocked or failed the
            forwarding rules for the alias.
          </p>
        </div>
      </div>

      <section className="ea-stack" aria-label="Blocked messages">
        {feed.status === 'loading' && (
          <output
            className="ea-card ea-card__pad"
            role="status"
            aria-busy="true"
            aria-label="Loading blocked mail"
          >
            <div className="skeleton skeleton--line-lg" />
            <div className="skeleton skeleton--line" />
            <div className="skeleton skeleton--line" />
          </output>
        )}

        {feed.status === 'error' && (
          <p role="alert" className="ea-notice ea-notice--error">
            {feed.error ?? 'Blocked mail could not be loaded.'}
          </p>
        )}

        {feed.status === 'ready' && feed.items.length === 0 && (
          <div className="ea-empty">
            <span className="ea-empty__art" aria-hidden="true">
              <IconEyeOff size={22} />
            </span>
            <p className="ea-empty__title">Nothing blocked</p>
            <p className="ea-empty__body">
              When Postern stops a message, it is listed here with the reason.
            </p>
          </div>
        )}

        {feed.items.length > 0 && (
          <>
            <ul className="ea-activity-list">
              {feed.items.map((message) => (
                <li key={message.id} className="ea-activity-row">
                  <div className="ea-activity-row__main">
                    <span className="ea-activity-row__avatar" aria-hidden="true">
                      <IconEyeOff size={16} />
                    </span>

                    <div className="ea-activity-row__body">
                      <div className="ea-activity-row__head">
                        <div className="ea-activity-row__identity">
                          <span className="ea-activity-row__sender">
                            {message.fromHeader || 'Unknown sender'}
                          </span>
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
                          <dt className="ea-activity-row__meta-label">Reason</dt>
                          <dd className="ea-activity-row__meta-value">
                            <span className="ea-chip ea-chip--danger">
                              {blockedReasonLabel(message.reason)}
                            </span>
                          </dd>
                        </div>
                        <div className="ea-activity-row__meta-group">
                          <dt className="ea-activity-row__meta-label">Alias</dt>
                          <dd className="ea-activity-row__meta-value">
                            {labels.get(message.aliasId) ?? 'Unknown alias'}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {feed.hasMore && (
              <div className="ea-card__foot">
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
