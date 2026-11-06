import { useState } from 'react'
import { ConfirmationDialog } from '../common/ConfirmationDialog'
import { RecoveryKeyNotice } from '../common/RecoveryKeyNotice'
import type { AdminInvite, InviteDashboard, InviteRequest } from '../../types'
import { formatDate } from '../../services/formatters'

interface AdminInviteDashboardProps {
  dashboard: InviteDashboard
  requests: InviteRequest[]
  busyAction: string | null
  actionError: string | null
  loadError: string | null
  isLoading: boolean
  recoveryKey: string | null
  onDismissRecoveryKey: () => void
  onRefresh: () => void
  onApprove: (requestId: string) => void
  onReject: (requestId: string) => void
  onResend: (inviteId: string) => void
  onRevoke: (inviteId: string) => void
}

function statusStyle(status: string): string {
  switch (status) {
    case 'delivered':
    case 'accepted':
      return 'bg-success-surface text-success-on-surface'
    case 'sent':
      return 'bg-info-surface text-info-on-surface'
    case 'bounced':
    case 'complained':
    case 'failed':
      return 'bg-danger-surface text-danger-on-surface'
    case 'pending':
      return 'bg-warning-surface text-warning-on-surface'
    default:
      return 'bg-surface-sunken text-text-muted'
  }
}

function formatExpiry(value: string | null): string {
  return value ? formatDate(value) : 'No expiry'
}

export function AdminInviteDashboard({
  dashboard,
  requests,
  busyAction,
  actionError,
  loadError,
  isLoading,
  recoveryKey,
  onDismissRecoveryKey,
  onRefresh,
  onApprove,
  onReject,
  onResend,
  onRevoke,
}: Readonly<AdminInviteDashboardProps>) {
  const [requestToReject, setRequestToReject] = useState<InviteRequest | null>(null)

  function confirmRevoke(invite: AdminInvite) {
    if (window.confirm(`Revoke the invite for ${invite.email}?`)) {
      onRevoke(invite.id)
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-link">
            Invitation management
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Admin dashboard</h1>
          <p className="mt-2 text-sm text-text-muted">
            Review invite requests and manage delivery from one place.
          </p>
        </div>
        <button type="button" className="btn btn--secondary" onClick={onRefresh} disabled={isLoading}>
          {isLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {recoveryKey && (
        <RecoveryKeyNotice recoveryKey={recoveryKey} onDismiss={onDismissRecoveryKey} className="p-5" />
      )}

      {loadError && (
        <p role="alert" className="rounded-lg bg-danger-surface px-4 py-3 text-sm text-danger-on-surface">
          {loadError}
        </p>
      )}
      {actionError && (
        <p role="alert" className="rounded-lg bg-danger-surface px-4 py-3 text-sm text-danger-on-surface">
          {actionError}
        </p>
      )}

      <section aria-label="Invitation capacity" className="grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
          <p className="text-sm font-semibold text-text-muted">Seats free</p>
          <p className="mt-2 text-4xl font-extrabold tracking-tight text-primary tnum">
            {dashboard.seatsFree}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Available after registered users and outstanding invites
          </p>
        </article>
        <article className="rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
          <p className="text-sm font-semibold text-text-muted">Outstanding invites</p>
          <p className="mt-2 text-4xl font-extrabold tracking-tight tnum">
            {dashboard.outstandingInvites}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            Unused invitations that have not expired or been revoked
          </p>
        </article>
      </section>

      <section className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm">
        <div className="border-b border-hairline px-5 py-4 sm:px-6">
          <h2 className="text-xl font-bold">Invite requests</h2>
          <p className="mt-1 text-sm text-text-muted">
            Approve a request to issue an invitation, or reject it.
          </p>
        </div>
        {requests.length === 0 ? (
          <p className="px-5 py-8 text-sm text-text-muted sm:px-6">No pending invite requests.</p>
        ) : (
          <ul className="divide-y divide-hairline">
            {requests.map((request) => (
              <li
                key={request.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
              >
                <div className="min-w-0">
                  <p className="break-all font-semibold">{request.email}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    Requested {formatDate(request.requestedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="btn btn--primary btn--sm"
                    disabled={busyAction !== null}
                    onClick={() => onApprove(request.id)}
                  >
                    {busyAction === `approve-${request.id}` ? 'Approving…' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger btn--sm"
                    disabled={busyAction !== null}
                    onClick={() => setRequestToReject(request)}
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm">
        <div className="border-b border-hairline px-5 py-4 sm:px-6">
          <h2 className="text-xl font-bold">All invites</h2>
          <p className="mt-1 text-sm text-text-muted">
            Delivery state, expiry, and available actions for each invitation.
          </p>
        </div>
        {dashboard.invites.length === 0 ? (
          <p className="px-5 py-8 text-sm text-text-muted sm:px-6">
            No invitations have been issued yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] text-left text-sm">
              <thead className="bg-surface-sunken text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold sm:px-6">
                    Recipient
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Expires
                  </th>
                  <th scope="col" className="px-5 py-3 text-right font-semibold sm:px-6">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {dashboard.invites.map((invite) => (
                  <tr key={invite.id}>
                    <td className="break-all px-5 py-4 font-medium sm:px-6">{invite.email}</td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusStyle(invite.status)}`}
                      >
                        {invite.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-text-muted">
                      {formatExpiry(invite.expiresAt)}
                    </td>
                    <td className="px-5 py-4 sm:px-6">
                      <div className="flex justify-end gap-2">
                        {invite.canResend && (
                          <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            disabled={busyAction !== null}
                            onClick={() => onResend(invite.id)}
                          >
                            {busyAction === `resend-${invite.id}` ? 'Resending…' : 'Resend'}
                          </button>
                        )}
                        {invite.canRevoke && (
                          <button
                            type="button"
                            className="btn btn--danger btn--sm"
                            disabled={busyAction !== null}
                            onClick={() => confirmRevoke(invite)}
                          >
                            {busyAction === `revoke-${invite.id}` ? 'Revoking…' : 'Revoke'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmationDialog
        open={requestToReject !== null}
        title="Reject this invite request?"
        description={
          requestToReject
            ? `Reject the request from ${requestToReject.email}? It will be removed from pending review, and this action cannot be undone.`
            : ''
        }
        confirmLabel="Reject invite request"
        busy={requestToReject !== null && busyAction === `reject-${requestToReject.id}`}
        onCancel={() => setRequestToReject(null)}
        onConfirm={() => {
          if (!requestToReject) {
            return
          }

          const rejectedRequest = requestToReject
          setRequestToReject(null)
          onReject(rejectedRequest.id)
        }}
      />
    </div>
  )
}
