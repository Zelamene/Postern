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

function statusTone(status: string): string {
  switch (status) {
    case 'delivered':
    case 'accepted':
      return 'ea-chip--success'
    case 'sent':
      return 'ea-chip--accent'
    case 'bounced':
    case 'complained':
    case 'failed':
      return 'ea-chip--danger'
    case 'pending':
      return 'ea-chip--neutral'
    default:
      return 'ea-chip--muted'
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
    <>
      <div className="ea-hero ea-hero--tight">
        <div>
          <h1 className="ea-title ea-title--md">Admin dashboard</h1>
          <p className="ea-lede">
            Review invite requests and manage delivery from one place.
          </p>
        </div>
        <div className="ea-hero__actions">
          <button type="button" className="btn btn--secondary" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {recoveryKey && (
        <div className="ea-admin-notice">
          <RecoveryKeyNotice recoveryKey={recoveryKey} onDismiss={onDismissRecoveryKey} />
        </div>
      )}

      {loadError && <p role="alert" className="ea-notice ea-notice--error">{loadError}</p>}
      {actionError && <p role="alert" className="ea-notice ea-notice--error">{actionError}</p>}

      <section aria-label="Invitation capacity" className="ea-admin-summary">
        <div className="ea-admin-summary__item">
          <span className="ea-admin-summary__label">Seats free</span>
          <strong className="ea-admin-summary__value tnum">{dashboard.seatsFree}</strong>
          <span className="ea-admin-summary__detail">
            Available after registered users and outstanding invites
          </span>
        </div>
        <div className="ea-admin-summary__item">
          <span className="ea-admin-summary__label">Outstanding invites</span>
          <strong className="ea-admin-summary__value tnum">{dashboard.outstandingInvites}</strong>
          <span className="ea-admin-summary__detail">
            Unused invitations that have not expired or been revoked
          </span>
        </div>
      </section>

      <section className="ea-admin-section" aria-labelledby="invite-requests-heading">
        <div className="ea-admin-section__head">
          <div>
            <h2 id="invite-requests-heading" className="ea-admin-section__title">Invite requests</h2>
            <p className="ea-admin-section__hint">
              Approve a request to issue an invitation, or reject it.
            </p>
          </div>
        </div>
        {requests.length === 0 ? (
          <p className="ea-admin-empty">No pending invite requests.</p>
        ) : (
          <ul className="ea-admin-list">
            {requests.map((request) => (
              <li key={request.id} className="ea-admin-row">
                <div className="ea-admin-row__primary">
                  <p className="ea-admin-row__title">{request.email}</p>
                  <p className="ea-admin-row__meta">Requested {formatDate(request.requestedAt)}</p>
                </div>
                <div className="ea-admin-actions">
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

      <section className="ea-admin-section" aria-labelledby="all-invites-heading">
        <div className="ea-admin-section__head">
          <div>
            <h2 id="all-invites-heading" className="ea-admin-section__title">All invites</h2>
            <p className="ea-admin-section__hint">
              Delivery state, expiry, and available actions for each invitation.
            </p>
          </div>
        </div>
        {dashboard.invites.length === 0 ? (
          <p className="ea-admin-empty">No invitations have been issued yet.</p>
        ) : (
          <div className="ea-admin-table-wrap">
            <table className="ea-admin-table">
              <thead>
                <tr>
                  <th scope="col">Recipient</th>
                  <th scope="col">Status</th>
                  <th scope="col">Expires</th>
                  <th scope="col" className="ea-admin-table__actions-head">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.invites.map((invite) => (
                  <tr key={invite.id}>
                    <td className="ea-admin-cell--primary">{invite.email}</td>
                    <td>
                      <span className={`ea-chip ${statusTone(invite.status)}`}>
                        {invite.status}
                      </span>
                    </td>
                    <td className="ea-admin-cell--muted">{formatExpiry(invite.expiresAt)}</td>
                    <td className="ea-admin-table__actions">
                      <div className="ea-admin-actions">
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
    </>
  )
}
