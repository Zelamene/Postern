import type { AdminAnalytics, AdminDistributionItem } from '../../services/adminService'
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
    <ul className="space-y-3">
      {items.map((item) => {
        const percent = total > 0 ? Math.round((item.count / total) * 100) : 0
        return (
          <li key={item.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold capitalize">{item.key}</span>
              <span className="tnum text-text-muted">{formatCount(item.count)}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-hairline" aria-hidden="true">
              <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
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
    <section aria-labelledby="analytics-heading" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-link">
            Service analytics
          </p>
          <h2 id="analytics-heading" className="text-2xl font-extrabold tracking-tight">
            Operational health
          </h2>
          <p className="mt-2 text-sm text-text-muted">
            Aggregated delivery, alias, and access signals for the last {label}. No message
            contents, subjects, or personal identities are shown.
          </p>
        </div>
        <div role="group" aria-label="Analytics window" className="flex gap-2">
          {WINDOW_OPTIONS.map((option) => (
            <button
              key={option.hours}
              type="button"
              className={option.hours === windowHours ? 'btn btn--primary btn--sm' : 'btn btn--secondary btn--sm'}
              aria-pressed={option.hours === windowHours}
              onClick={() => onWindowHoursChange(option.hours)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="alert" className="rounded-lg bg-danger-surface px-4 py-3 text-sm text-danger-on-surface">
            {error}
          </p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={onReload}>
            Try again
          </button>
        </div>
      )}

      {!analytics && isLoading && (
        <div className="flex min-h-32 items-center justify-center gap-3 text-text-muted" role="status">
          <span className="spinner" aria-hidden="true" />
          Loading analytics
        </div>
      )}

      {analytics && (
        <AnalyticsContent
          analytics={analytics}
          isLoading={isLoading}
          label={label}
        />
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
    <div className="space-y-5">
      {isLoading && (
        <p role="status" className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          Updating analytics…
        </p>
      )}

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

      <div className="grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="ingestion-heading" className="panel lg:col-span-2">
          <div className="panel__header">
            <div>
              <h3 id="ingestion-heading" className="text-lg font-bold">Hourly ingestion</h3>
              <p className="mt-1 text-sm text-text-muted">
                Forwarded and blocked mail over the last {label}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="chip chip--primary">Forwarded</span>
              <span className="chip chip--danger">Blocked</span>
            </div>
          </div>
          <div className="panel__body space-y-3">
            {peakHour && (
              <p className="text-sm text-text-muted">
                Peak hour:{' '}
                <span className="font-semibold text-text">
                  {formatHour(peakHour.hour)} · {formatCount(peakHour.forwarded + peakHour.blocked)} messages
                </span>
              </p>
            )}
            <div className="flex h-36 items-end gap-1 border-b border-hairline pb-px" aria-hidden="true">
              {hourlyIngestion.map((item) => (
                <div key={item.hour} className="flex h-full flex-1 items-end gap-[2px]">
                  <span
                    className="w-1/2 rounded-t-sm bg-primary"
                    style={{ height: `${(item.forwarded / maxHourly) * 100}%` }}
                  />
                  <span
                    className="w-1/2 rounded-t-sm bg-danger"
                    style={{ height: `${(item.blocked / maxHourly) * 100}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xs text-text-muted" aria-hidden="true">
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

        <section aria-labelledby="sender-domains-heading" className="panel">
          <div className="panel__header">
            <div>
              <h3 id="sender-domains-heading" className="text-lg font-bold">Sender domains</h3>
              <p className="mt-1 text-sm text-text-muted">Normalized domains, not individual senders.</p>
            </div>
          </div>
          <div className="panel__body">
            {analytics.senderDomains.length === 0 ? (
              <p className="text-sm text-text-muted">
                No sender domains meet the reporting threshold yet.
              </p>
            ) : (
              <table className="table">
                <caption className="sr-only">Top sender domains for the last {label}</caption>
                <thead>
                  <tr>
                    <th scope="col">Domain</th>
                    <th scope="col" className="text-right">Messages</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.senderDomains.map((domain) => (
                    <tr key={domain.domain}>
                      <td className="addr">{domain.domain}</td>
                      <td className="table__num text-right">{formatCount(domain.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {analytics.hiddenSenderDomains > 0 && (
              <p className="mt-4 text-xs text-text-muted">
                {formatCount(analytics.hiddenSenderDomains)} lower-volume{' '}
                {analytics.hiddenSenderDomains === 1 ? 'domain is' : 'domains are'} hidden to protect
                sender privacy. Domains need at least {analytics.minimumDomainVolume} messages to
                appear.
              </p>
            )}
          </div>
        </section>

        <section aria-labelledby="block-reasons-heading" className="panel">
          <div className="panel__header">
            <div>
              <h3 id="block-reasons-heading" className="text-lg font-bold">Block reasons</h3>
              <p className="mt-1 text-sm text-text-muted">Why mail was stopped before delivery.</p>
            </div>
          </div>
          <div className="panel__body">
            {analytics.blockedReasons.length === 0 ? (
              <p className="text-sm text-text-muted">No blocked mail was recorded in this window.</p>
            ) : (
              <table className="table">
                <caption className="sr-only">Block reasons for the last {label}</caption>
                <thead>
                  <tr>
                    <th scope="col">Reason</th>
                    <th scope="col" className="text-right">Messages</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.blockedReasons.map((reason) => (
                    <tr key={reason.reason}>
                      <td className="capitalize">{reason.reason.replaceAll('_', ' ')}</td>
                      <td className="table__num text-right">{formatCount(reason.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section aria-labelledby="alias-status-heading" className="panel">
          <div className="panel__header">
            <div>
              <h3 id="alias-status-heading" className="text-lg font-bold">Alias status</h3>
              <p className="mt-1 text-sm text-text-muted">Disposable addresses by lifecycle state.</p>
            </div>
          </div>
          <div className="panel__body">
            <DistributionList items={analytics.aliasStatuses} total={aliasTotal} />
          </div>
        </section>

        <section aria-labelledby="auth-results-heading" className="panel">
          <div className="panel__header">
            <div>
              <h3 id="auth-results-heading" className="text-lg font-bold">Authentication results</h3>
              <p className="mt-1 text-sm text-text-muted">Sender authentication across ingested mail.</p>
            </div>
          </div>
          <div className="panel__body">
            <DistributionList items={analytics.authenticationResults} total={authTotal} />
          </div>
        </section>

        <section aria-labelledby="audit-heading" className="panel lg:col-span-2">
          <div className="panel__header">
            <div>
              <h3 id="audit-heading" className="text-lg font-bold">Recent administrator activity</h3>
              <p className="mt-1 text-sm text-text-muted">Audited actions from the last 30 days.</p>
            </div>
          </div>
          {analytics.recentAudit.length === 0 ? (
            <p className="panel__body text-sm text-text-muted">
              No administrator actions recorded in the last 30 days.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {analytics.recentAudit.map((entry) => (
                <li key={entry.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-semibold">
                      <code>{entry.action}</code>
                    </p>
                    <p className="text-xs text-text-muted">{formatDateTime(entry.createdAt)}</p>
                  </div>
                  <p className="mt-1 break-all text-xs text-text-muted">
                    {entry.targetId ? `Target ${entry.targetId}` : 'No target recorded'}
                  </p>
                  {entry.metadata && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-semibold">
                        View metadata
                      </summary>
                      <pre className="mt-2 overflow-x-auto text-xs">{entry.metadata}</pre>
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
    <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
      <dt className="text-sm font-semibold text-text-muted">{label}</dt>
      <dd className="mt-2 text-3xl font-extrabold tracking-tight tnum">{value}</dd>
      <dd className="mt-1 text-xs text-text-muted">{detail}</dd>
    </div>
  )
}
