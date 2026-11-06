import { IconRefresh } from '../common/Icons'
import type { KvSyncResult } from '../../services/adminService'

interface AdminKvSyncPanelProps {
  dirtyAliases: number | null
  result: KvSyncResult | null
  error: string | null
  isSyncing: boolean
  onSync: () => void
}

export function AdminKvSyncPanel({
  dirtyAliases,
  result,
  error,
  isSyncing,
  onSync,
}: Readonly<AdminKvSyncPanelProps>) {
  const queueLabel =
    dirtyAliases === null
      ? 'Queue state unavailable'
      : dirtyAliases === 0
        ? 'All aliases in sync'
        : `${dirtyAliases.toLocaleString()} ${dirtyAliases === 1 ? 'alias' : 'aliases'} queued`

  return (
    <section aria-labelledby="kv-sync-heading" className="panel">
      <div className="panel__header">
        <div>
          <h2 id="kv-sync-heading" className="text-xl font-bold">Key-value sync</h2>
          <p className="mt-1 text-sm text-text-muted">
            Push alias and policy changes to the edge key-value store.
          </p>
        </div>
        <span className={dirtyAliases === 0 ? 'chip chip--success' : 'chip chip--warning'}>
          {queueLabel}
        </span>
      </div>
      <div className="panel__body space-y-4">
        <p className="text-sm text-text-muted">
          The nightly job syncs dirty aliases automatically. Run a manual sync after bulk changes or
          when the queue needs to drain immediately.
        </p>

        <button type="button" className="btn btn--primary" onClick={onSync} disabled={isSyncing}>
          <IconRefresh size={16} />
          {isSyncing ? 'Syncing…' : 'Sync now'}
        </button>

        {error && (
          <p role="alert" className="rounded-lg bg-danger-surface px-4 py-3 text-sm text-danger-on-surface">
            {error}
          </p>
        )}

        <div aria-live="polite">
          {result && result.aliasesFailed > 0 && (
            <div className="rounded-lg bg-warning-surface px-4 py-3 text-sm text-warning-on-surface">
              <p className="font-semibold">
                Synced {result.aliasesSynced.toLocaleString()}{' '}
                {result.aliasesSynced === 1 ? 'alias' : 'aliases'}; {result.aliasesFailed.toLocaleString()}{' '}
                failed.
              </p>
              <p className="mt-1">
                {result.remainingDirtyAliases.toLocaleString()}{' '}
                {result.remainingDirtyAliases === 1 ? 'alias remains' : 'aliases remain'} queued for
                the next attempt.
              </p>
            </div>
          )}

          {result && result.aliasesFailed === 0 && (
            <div className="rounded-lg bg-success-surface px-4 py-3 text-sm text-success-on-surface">
              <p className="font-semibold">
                Synced {result.aliasesSynced.toLocaleString()}{' '}
                {result.aliasesSynced === 1 ? 'alias' : 'aliases'}.
              </p>
              <p className="mt-1">
                {result.remainingDirtyAliases === 0
                  ? 'Every alias is in sync.'
                  : `${result.remainingDirtyAliases.toLocaleString()} remain queued.`}
              </p>
              <p className="mt-1 text-xs">
                {result.globalBlocklistRebuilt ? 'Global blocklist rebuilt.' : 'Global blocklist unchanged.'}{' '}
                {result.suspendedUsersRebuilt ? 'Suspended-user map rebuilt.' : 'Suspended-user map unchanged.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
