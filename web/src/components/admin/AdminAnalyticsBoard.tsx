import type { AdminAnalytics, AdminDistributionItem } from '../../types'
import { formatDateTime } from '../../services/formatters'

interface AdminAnalyticsBoardProps {
  analytics: AdminAnalytics | null
  error: string | null
  isLoading: boolean
  windowHours: number
  onWindowHoursChange: (hours: number) => void
  onReload: () => void
}

const WINDOW_OPTIONS = [
  { hours: 24, label: '24 hours' },
  { hours: 168, label: '7 days' },
]

function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value)
}

function formatHour(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Unknown'
  }

  return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(date)
}

function windowLabel(hours: number): string {
  return hours === 168 ? '7 days' : `${hours} hours`
}

function DistributionList({
  items,
  total,
}: Readonly<{ items: AdminDistributionItem[]; total: number }>) {
  return (
    <ul className="ea-admin-list">
      {items.map((item) => {
        const percent = total > 0 ? Math.round((item.count / total) * 100) : 0
        return (
          <li key={item.key} className="ea-admin-distribution">
            <div className="ea-admin-distribution__head">
              <span className="ea-admin-distribution__label">{item.key}</span>
              <span className="tnum ea-admin-distribution__count">{formatCount(item.count)}</span>
            </div>
            <div className="ea-admin-bar" aria-hidden="true">
              <span className="ea-admin-bar__fill" style={{ width: `${percent}%` }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function AdminAnalyticsBoard({
  analytics,
  error,
  isLoading,
  windowHours,
  onWindowHoursChange,
  onReload,
}: Readonly<AdminAnalyticsBoardProps>) {
  const label = windowLabel(windowHours)

  return (
    <section aria-labelledby="analytics-heading" className="ea-admin-section">
      <div className="ea-admin-section__head">
        <div>
          <h2 id="analytics-heading" className="ea-admin-section__title">
            Operational health
          </h2>
          <p className="ea-admin-section__hint">
            Aggregated delivery, alias, and access signals for the last {label}. No message
            contents, subjects, or personal identities are shown.
          </p>
        </div>
        <div role="group" aria-label="Analytics window" className="ea-admin-segment">
          {WINDOW_OPTIONS.map((option) => (
            <button
              key={option.hours}
              type="button"
              className="btn btn--sm"
              aria-pressed={option.hours === windowHours}
              onClick={() => onWindowHoursChange(option.hours)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="ea-admin-inline">
          <p role="alert" className="ea-notice ea-notice--error">{error}</p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={onReload}>
            Try again
          </button>
        </div>
      )}

      {!analytics && isLoading && (
        <div className="ea-admin-loading" role="status">
          <span className="spinner" aria-hidden="true" />
          Loading analytics
        </div>
      )}

      {analytics && (
        <AnalyticsContent analytics={analytics} isLoading={isLoading} label={label} />
      )}
    </section>
  )
}

function AnalyticsContent({
  analytics,
  isLoading,
  label,
}: Readonly<{ analytics: AdminAnalytics; isLoading: boolean; label: string }>) {
  const { totals, hourlyIngestion } = analytics
  const ingested = totals.forwardedMessages + totals.blockedMessages
  const blockRate = ingested > 0 ? Math.round((totals.blockedMessages / ingested) * 100) : 0
  const peakHour = hourlyIngestion.reduce<AdminAnalytics['hourlyIngestion'][number] | null>(
    (best, item) => {
      const total = item.forwarded + item.blocked
      const bestTotal = best ? best.forwarded + best.blocked : -1
      return total > bestTotal ? item : best
    },
    null,
  )
  const maxHourly = Math.max(
    1,
    ...hourlyIngestion.map((item) => Math.max(item.forwarded, item.blocked)),
  )
  const aliasTotal = totals.aliases
  const authTotal = analytics.authenticationResults.reduce((sum, item) => sum + item.count, 0)

  return (
    <div className="ea-admin-stack ea-admin-stack--tight">
      {isLoading && (
        <p role="status" className="ea-hint">
          Updating analytics…
        </p>
      )}

      <dl className="ea-admin-metrics">
        <Metric label="Forwarded" value={formatCount(totals.forwardedMessages)} detail={`Accepted for delivery in the last ${label}`} />
        <Metric label="Blocked" value={formatCount(totals.blockedMessages)} detail={`Stopped before delivery in the last ${label}`} />
        <Metric label="Block rate" value={`${blockRate}%`} detail="Blocked share of all ingested mail" />
        <Metric
          label="Unexpected senders"
          value={formatCount(totals.unexpectedSenderMessages)}
          detail="Blocked because the sender was not expected"
        />
        <Metric
          label="Active aliases"
          value={formatCount(totals.activeAliases)}
          detail={`${formatCount(aliasTotal)} aliases in total`}
        />
        <Metric label="Registered users" value={formatCount(totals.registeredUsers)} detail="Active and suspended accounts" />
        <Metric label="Pending requests" value={formatCount(totals.pendingInviteRequests)} detail="Invite requests awaiting review" />
        <Metric label="KV sync queue" value={formatCount(totals.kvDirtyAliases)} detail="Aliases waiting for edge replication" />
      </dl>

      <div className="ea-admin-grid">
        <section aria-labelledby="ingestion-heading" className="ea-admin-panel ea-admin-panel--wide">
          <div className="ea-admin-panel__head">
            <div>
              <h3 id="ingestion-heading" className="ea-admin-panel__title">Hourly ingestion</h3>
              <p className="ea-admin-panel__hint">
                Forwarded and blocked mail over the last {label}.
              </p>
            </div>
            <div className="ea-admin-legend">
              <span className="ea-chip ea-chip--accent">Forwarded</span>
              <span className="ea-chip ea-chip--danger">Blocked</span>
            </div>
          </div>
          <div className="ea-admin-panel__body">
            {peakHour && (
              <p className="ea-admin-panel__note">
                Peak hour:{' '}
                <strong>
                  {formatHour(peakHour.hour)} · {formatCount(peakHour.forwarded + peakHour.blocked)} messages
                </strong>
              </p>
            )}
            <div className="ea-admin-chart" aria-hidden="true">
              {hourlyIngestion.map((item) => (
                <div key={item.hour} className="ea-admin-chart__hour">
                  <span
                    className="ea-admin-chart__bar ea-admin-chart__bar--forwarded"
                    style={{ height: `${(item.forwarded / maxHourly) * 100}%` }}
                  />
                  <span
                    className="ea-admin-chart__bar ea-admin-chart__bar--blocked"
                    style={{ height: `${(item.blocked / maxHourly) * 100}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="ea-admin-chart__axis" aria-hidden="true">
              <span>{hourlyIngestion[0] ? formatHour(hourlyIngestion[0].hour) : ''}</span>
              <span>{hourlyIngestion[hourlyIngestion.length - 1] ? formatHour(hourlyIngestion[hourlyIngestion.length - 1].hour) : ''}</span>
            </div>
            <table className="sr-only">
              <caption>Hourly ingestion for the last {label}</caption>
              <thead>
                <tr>
                  <th scope="col">Hour</th>
                  <th scope="col">Forwarded</th>
                  <th scope="col">Blocked</th>
                </tr>
              </thead>
              <tbody>
                {hourlyIngestion.map((item) => (
                  <tr key={item.hour}>
                    <th scope="row">{formatDateTime(item.hour)}</th>
                    <td>{item.forwarded}</td>
                    <td>{item.blocked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="sender-domains-heading" className="ea-admin-panel">
          <div className="ea-admin-panel__head">
            <div>
              <h3 id="sender-domains-heading" className="ea-admin-panel__title">Sender domains</h3>
              <p className="ea-admin-panel__hint">Normalized domains, not individual senders.</p>
            </div>
          </div>
          <div className="ea-admin-panel__body">
            {analytics.senderDomains.length === 0 ? (
              <p className="ea-admin-empty">
                No sender domains meet the reporting threshold yet.
              </p>
            ) : (
              <div className="ea-admin-table-wrap">
                <table className="ea-admin-table">
                  <caption className="sr-only">Top sender domains for the last {label}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Domain</th>
                      <th scope="col" className="ea-admin-table__num">Messages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.senderDomains.map((domain) => (
                      <tr key={domain.domain}>
                        <td className="ea-mono">{domain.domain}</td>
                        <td className="ea-admin-table__num">{formatCount(domain.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {analytics.hiddenSenderDomains > 0 && (
              <p className="ea-admin-panel__note">
                {formatCount(analytics.hiddenSenderDomains)} lower-volume{' '}
                {analytics.hiddenSenderDomains === 1 ? 'domain is' : 'domains are'} hidden to protect
                sender privacy. Domains need at least {analytics.minimumDomainVolume} messages to
                appear.
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby="block-reasons-heading" className="ea-admin-panel">
          <div className="ea-admin-panel__head">
            <div>
              <h3 id="block-reasons-heading" className="ea-admin-panel__title">Block reasons</h3>
              <p className="ea-admin-panel__hint">Why mail was stopped before delivery.</p>
            </div>
          </div>
          <div className="ea-admin-panel__body">
            {analytics.blockedReasons.length === 0 ? (
              <p className="ea-admin-empty">No blocked mail was recorded in this window.</p>
            ) : (
              <div className="ea-admin-table-wrap">
                <table className="ea-admin-table">
                  <caption className="sr-only">Block reasons for the last {label}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Reason</th>
                      <th scope="col" className="ea-admin-table__num">Messages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.blockedReasons.map((reason) => (
                      <tr key={reason.reason}>
                        <td className="ea-admin-capitalize">{reason.reason.replaceAll('_', ' ')}</td>
                        <td className="ea-admin-table__num">{formatCount(reason.count)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="alias-status-heading" className="ea-admin-panel">
          <div className="ea-admin-panel__head">
            <div>
              <h3 id="alias-status-heading" className="ea-admin-panel__title">Alias status</h3>
              <p className="ea-admin-panel__hint">Disposable addresses by lifecycle state.</p>
            </div>
          </div>
          <div className="ea-admin-panel__body">
            <DistributionList items={analytics.aliasStatuses} total={aliasTotal} />
          </div>
        </section>

        <section aria-labelledby="auth-results-heading" className="ea-admin-panel">
          <div className="ea-admin-panel__head">
            <div>
              <h3 id="auth-results-heading" className="ea-admin-panel__title">Authentication results</h3>
              <p className="ea-admin-panel__hint">Sender authentication across ingested mail.</p>
            </div>
          </div>
          <div className="ea-admin-panel__body">
            <DistributionList items={analytics.authenticationResults} total={authTotal} />
          </div>
        </section>

        <section aria-labelledby="audit-heading" className="ea-admin-panel ea-admin-panel--wide">
          <div className="ea-admin-panel__head">
            <div>
              <h3 id="audit-heading" className="ea-admin-panel__title">Recent administrator activity</h3>
              <p className="ea-admin-panel__hint">Audited actions from the last 30 days.</p>
            </div>
          </div>
          {analytics.recentAudit.length === 0 ? (
            <p className="ea-admin-panel__body ea-admin-empty">
              No administrator actions recorded in the last 30 days.
            </p>
          ) : (
            <ul className="ea-admin-list">
              {analytics.recentAudit.map((entry) => (
                <li key={entry.id} className="ea-admin-row ea-admin-row--stack">
                  <div className="ea-admin-row__head">
                    <code className="ea-admin-row__title">{entry.action}</code>
                    <span className="ea-admin-row__meta">{formatDateTime(entry.createdAt)}</span>
                  </div>
                  <p className="ea-admin-row__meta">
                    {entry.targetId ? `Target ${entry.targetId}` : 'No target recorded'}
                  </p>
                  {entry.metadata && (
                    <details className="ea-admin-details">
                      <summary>View metadata</summary>
                      <pre>{entry.metadata}</pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  detail,
}: Readonly<{ label: string; value: string; detail: string }>) {
  return (
    <div className="ea-admin-metric">
      <dt className="ea-admin-metric__label">{label}</dt>
      <dd className="ea-admin-metric__value tnum">{value}</dd>
      <dd className="ea-admin-metric__detail">{detail}</dd>
    </div>
  )
}
