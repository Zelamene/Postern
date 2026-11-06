import { useState, type FormEvent } from 'react'
import { ConfirmationDialog } from '../common/ConfirmationDialog'
import type { BlocklistEntry } from '../../types'
import { formatDate } from '../../services/formatters'

interface AdminBlocklistPanelProps {
  entries: BlocklistEntry[]
  isLoading: boolean
  error: string | null
  busyDomain: string | null
  onAdd: (domain: string, reason: string) => Promise<boolean>
  onRemove: (domain: string) => Promise<boolean>
  onReload: () => void
}

export function AdminBlocklistPanel({
  entries,
  isLoading,
  error,
  busyDomain,
  onAdd,
  onRemove,
  onReload,
}: Readonly<AdminBlocklistPanelProps>) {
  const [domain, setDomain] = useState('')
  const [reason, setReason] = useState('')
  const [entryToUnblock, setEntryToUnblock] = useState<BlocklistEntry | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const added = await onAdd(domain, reason)
    if (added) {
      setDomain('')
      setReason('')
    }
  }

  return (
    <section aria-labelledby="blocklist-heading" className="panel">
      <div className="panel__header">
        <div>
          <h2 id="blocklist-heading" className="text-xl font-bold">Global blocklist</h2>
          <p className="mt-1 text-sm text-text-muted">
            Domains blocked for every alias across Postern.
          </p>
        </div>
        <span className="chip">{entries.length} blocked</span>
      </div>
      <div className="panel__body space-y-5">
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

        <form className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_auto] sm:items-end" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="blocklist-domain" className="mb-1 block text-sm font-semibold">
              Domain
            </label>
            <input
              id="blocklist-domain"
              type="text"
              className="input w-full"
              placeholder="example.com"
              autoComplete="off"
              spellCheck={false}
              required
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="blocklist-reason" className="mb-1 block text-sm font-semibold">
              Reason
            </label>
            <input
              id="blocklist-reason"
              type="text"
              className="input w-full"
              placeholder="Optional"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <button type="submit" className="btn btn--primary" disabled={busyDomain !== null}>
            {busyDomain === 'add' ? 'Blocking…' : 'Block domain'}
          </button>
        </form>

        {isLoading && entries.length === 0 ? (
          <div className="flex min-h-24 items-center justify-center gap-3 text-text-muted" role="status">
            <span className="spinner" aria-hidden="true" />
            Loading blocklist
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-text-muted">No domains are blocked yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <caption className="sr-only">Globally blocked domains</caption>
              <thead>
                <tr>
                  <th scope="col">Domain</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Added</th>
                  <th scope="col" className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.domain}>
                    <td className="addr">{entry.domain}</td>
                    <td>{entry.reason}</td>
                    <td className="whitespace-nowrap text-text-muted">{formatDate(entry.createdAt)}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn btn--danger btn--sm"
                        disabled={busyDomain !== null}
                        onClick={() => setEntryToUnblock(entry)}
                      >
                        {busyDomain === entry.domain ? 'Unblocking…' : 'Unblock'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmationDialog
        open={entryToUnblock !== null}
        title="Unblock this domain?"
        description={
          entryToUnblock
            ? `Allow mail from ${entryToUnblock.domain} again? Aliases will start accepting it immediately.`
            : ''
        }
        confirmLabel="Unblock domain"
        busy={entryToUnblock !== null && busyDomain === entryToUnblock.domain}
        onCancel={() => setEntryToUnblock(null)}
        onConfirm={() => {
          if (!entryToUnblock) {
            return
          }

          const target = entryToUnblock
          setEntryToUnblock(null)
          void onRemove(target.domain)
        }}
      />
    </section>
  )
}
