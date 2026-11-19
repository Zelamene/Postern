import { IconRefresh } from '../common/Icons'
import type { KvSyncResult } from '../../types'

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
  const queueTone = dirtyAliases === 0 ? 'ea-chip--success' : 'ea-chip--accent'

  return (
    <section aria-labelledby="kv-sync-heading" className="ea-admin-panel">
      <div className="ea-admin-panel__head">
        <div>
          <h2 id="kv-sync-heading" className="ea-admin-panel__title">Key-value sync</h2>
          <p className="ea-admin-panel__hint">
            Push alias and policy changes to the edge key-value store.
          </p>
        </div>
        <span className={`ea-chip ${queueTone}`}>{queueLabel}</span>
      </div>
      <div className="ea-admin-panel__body">
        <p className="ea-admin-panel__note">
          The nightly job syncs dirty aliases automatically. Run a manual sync after bulk changes or
          when the queue needs to drain immediately.
        </p>

        <button type="button" className="btn btn--primary" onClick={onSync} disabled={isSyncing}>
          <IconRefresh size={16} />
          {isSyncing ? 'Syncing…' : 'Sync now'}
        </button>

        {error && (
          <p role="alert" className="ea-notice ea-notice--error">{error}</p>
        )}

        <div aria-live="polite" className="ea-admin-stack ea-admin-stack--tight">
          {result && result.aliasesFailed > 0 && (
            <div className="ea-notice ea-notice--error">
              <p className="ea-admin-result__title">
                Synced {result.aliasesSynced.toLocaleString()}{' '}
                {result.aliasesSynced === 1 ? 'alias' : 'aliases'}; {result.aliasesFailed.toLocaleString()}{' '}
                failed.
              </p>
              <p>
                {result.remainingDirtyAliases.toLocaleString()}{' '}
                {result.remainingDirtyAliases === 1 ? 'alias remains' : 'aliases remain'} queued for
                the next attempt.
              </p>
            </div>
          )}

          {result && result.aliasesFailed === 0 && (
            <div className="ea-notice">
              <p className="ea-admin-result__title">
                Synced {result.aliasesSynced.toLocaleString()}{' '}
                {result.aliasesSynced === 1 ? 'alias' : 'aliases'}.
              </p>
              <p>
                {result.remainingDirtyAliases === 0
                  ? 'Every alias is in sync.'
                  : `${result.remainingDirtyAliases.toLocaleString()} remain queued.`}
              </p>
              <p className="ea-hint">
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
