using Postern.Domain.Accounts;

namespace Postern.Application.Accounts;

public interface IInviteRepository
{
    Task<string?> FindValidRecipientAsync(
        string codeHash,
        DateTimeOffset now,
        CancellationToken cancellationToken);
    Task<IReadOnlyList<InviteEmailOutboxMessage>> ListPendingOutboxMessagesAsync(
        DateTimeOffset now,
        CancellationToken cancellationToken);
    Task AddRequestAsync(InviteRequest request, CancellationToken cancellationToken);
    Task<IReadOnlyList<InviteRequest>> ListPendingRequestsAsync(CancellationToken cancellationToken);
    Task<bool> ApproveRequestAsync(
        Guid requestId,
        Guid adminUserId,
        InviteCode invite,
        InviteEmailOutboxMessage outboxMessage,
        DateTimeOffset now,
        CancellationToken cancellationToken);
    Task<bool> RejectRequestAsync(
        Guid requestId,
        Guid adminUserId,
        DateTimeOffset now,
        CancellationToken cancellationToken);
    Task<bool> ResendAsync(
        Guid inviteId,
        Guid adminUserId,
        string codeHash,
        string protectedCode,
        DateTimeOffset now,
        DateTimeOffset expiresAt,
        string inviterName,
        Guid outboxMessageId,
        CancellationToken cancellationToken);
    Task<bool> RevokeAsync(
        Guid inviteId,
        Guid adminUserId,
        DateTimeOffset now,
        CancellationToken cancellationToken);
    Task<InviteEmailOutboxMessage?> ClaimNextOutboxMessageAsync(
        DateTimeOffset now,
        DateTimeOffset leaseExpiresAt,
        CancellationToken cancellationToken);
    Task MarkOutboxMessageSentAsync(
        Guid outboxMessageId,
        string providerMessageId,
        DateTimeOffset sentAt,
        CancellationToken cancellationToken);
    Task ScheduleOutboxRetryAsync(
        Guid outboxMessageId,
        DateTimeOffset nextAttemptAt,
        string error,
        bool permanentlyFailed,
        CancellationToken cancellationToken);
    Task<bool> RecordWebhookEventAsync(
        string eventId,
        string eventType,
        string? providerMessageId,
        DateTimeOffset receivedAt,
        CancellationToken cancellationToken);
}
