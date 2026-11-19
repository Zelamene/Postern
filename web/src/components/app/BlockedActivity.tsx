import { IconEyeOff } from '../common/Icons'
import type { ActivityFeed, Alias, BlockedMessage } from '../../types'
import { formatDateTime } from '../../services/formatters'

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
        {feed.items.length > 0 && (
          <div className="ea-stats" aria-label="Blocked summary">
            <span className="ea-stats__item">
              <span className="ea-dot ea-dot--accent" aria-hidden="true" />
              <span>
                {feed.items.length} loaded {feed.items.length === 1 ? 'entry' : 'entries'}
              </span>
            </span>
          </div>
        )}
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
            <div className="ea-section-head">
              <h2 className="ea-section-title">Incident register</h2>
              <span className="ea-section-note">Loaded entries only</span>
            </div>

            <ul className="ea-timeline">
              {feed.items.map((message) => (
                <li key={message.id} className="ea-event">
                  <span className="ea-marker ea-marker--accent" aria-hidden="true">
                    <IconEyeOff size={16} />
                  </span>
                  <article className="ea-event__card">
                    <div className="ea-event__head">
                      <span className="ea-chip ea-chip--danger">{message.reason}</span>
                      <time className="ea-event__time" dateTime={message.receivedAt}>
                        {formatDateTime(message.receivedAt)}
                      </time>
                    </div>

                    <p className="ea-section-note">Subject abstract</p>
                    <p className="ea-event__subject">
                      {message.subject?.trim() || 'No subject'}
                    </p>
                    <p className="ea-hint">This message was not forwarded to your destination.</p>

                    <div className="ea-register-grid">
                      <div>
                        <span className="ea-spec__label">Sender</span>
                        <span className="ea-spec__value ea-spec__value--sm">
                          {message.fromHeader || 'Unknown sender'}
                        </span>
                      </div>
                      <div>
                        <span className="ea-spec__label">Alias affected</span>
                        <span className="ea-spec__value ea-spec__value--sm">
                          {labels.get(message.aliasId) ?? 'Unknown alias'}
                        </span>
                      </div>
                    </div>
                  </article>
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
