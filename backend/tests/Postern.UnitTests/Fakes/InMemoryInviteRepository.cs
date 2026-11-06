using Postern.Application.Accounts;
using Postern.Domain.Accounts;

namespace Postern.UnitTests.Fakes;

public sealed class InMemoryInviteRepository : IInviteRepository
{
    public List<InviteCode> Invites { get; } = [];
    public List<InviteRequest> Requests { get; } = [];
    public List<InviteEmailOutboxMessage> Outbox { get; } = [];
    public List<(string EventId, string EventType, string? ProviderMessageId, DateTimeOffset ReceivedAt)> WebhookEvents { get; } = [];

    public int RegisteredUsers { get; set; }
    public int OutstandingInvites { get; set; }
    public bool ApproveResult { get; set; } = true;
    public bool RejectResult { get; set; } = true;
    public bool ResendResult { get; set; } = true;
    public bool RevokeResult { get; set; } = true;
    public bool WebhookResult { get; set; } = true;

    public Task<string?> FindValidRecipientAsync(string codeHash, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var invite = Invites.FirstOrDefault(i => i.CodeHash == codeHash && i.UsedAt is null && i.RevokedAt is null && (i.ExpiresAt is null || i.ExpiresAt > now));
        return Task.FromResult<string?>(string.IsNullOrWhiteSpace(invite?.Email) ? null : invite.Email);
    }

    public Task<AdminInviteDashboardData> GetAdminDashboardAsync(DateTimeOffset now, CancellationToken cancellationToken)
    {
        var records = Invites.Select(i => new AdminInviteRecord(i.Id, i.Email, i.DeliveryStatus, i.CreatedAt, i.ExpiresAt, i.UsedAt, i.RevokedAt)).ToList();
        return Task.FromResult(new AdminInviteDashboardData(records, RegisteredUsers, OutstandingInvites));
    }

    public Task<IReadOnlyList<InviteEmailOutboxMessage>> ListPendingOutboxMessagesAsync(DateTimeOffset now, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<InviteEmailOutboxMessage>>(Outbox.Where(m => m.Status == "pending").ToList());

    public Task AddRequestAsync(InviteRequest request, CancellationToken cancellationToken)
    {
        Requests.Add(request);
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<InviteRequest>> ListPendingRequestsAsync(CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyList<InviteRequest>>(Requests.Where(r => r.Status == "pending").ToList());

    public Task<InviteRequest?> GetPendingRequestAsync(Guid requestId, CancellationToken cancellationToken) =>
        Task.FromResult(Requests.FirstOrDefault(r => r.Id == requestId && r.Status == "pending"));

    public Task<bool> ApproveRequestAsync(Guid requestId, Guid adminUserId, InviteCode invite, InviteEmailOutboxMessage outboxMessage, DateTimeOffset now, CancellationToken cancellationToken)
    {
        if (!ApproveResult) return Task.FromResult(false);
        var request = Requests.FirstOrDefault(r => r.Id == requestId);
        if (request is not null)
        {
            request.Status = "approved";
            request.ReviewedAt = now;
            request.ReviewedByUserId = adminUserId;
            request.InviteId = invite.Id;
        }
        Invites.Add(invite);
        Outbox.Add(outboxMessage);
        return Task.FromResult(true);
    }

    public Task<bool> RejectRequestAsync(Guid requestId, Guid adminUserId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        if (!RejectResult) return Task.FromResult(false);
        var request = Requests.FirstOrDefault(r => r.Id == requestId);
        if (request is not null)
        {
            request.Status = "rejected";
            request.ReviewedAt = now;
            request.ReviewedByUserId = adminUserId;
        }
        return Task.FromResult(true);
    }

    public Task<bool> ResendAsync(Guid inviteId, Guid adminUserId, string codeHash, string protectedCode, DateTimeOffset now, DateTimeOffset expiresAt, string inviterName, Guid outboxMessageId, CancellationToken cancellationToken)
    {
        if (!ResendResult) return Task.FromResult(false);
        var invite = Invites.FirstOrDefault(i => i.Id == inviteId);
        if (invite is not null)
        {
            invite.CodeHash = codeHash;
            invite.ExpiresAt = expiresAt;
            invite.DeliveryStatus = InviteDeliveryStatus.Pending;
        }
        Outbox.Add(new InviteEmailOutboxMessage
        {
            Id = outboxMessageId,
            InviteId = inviteId,
            RecipientEmail = invite?.Email ?? "",
            ProtectedInviteCode = protectedCode,
            InviterName = inviterName,
            ExpiresAt = expiresAt,
            CreatedAt = now,
            NextAttemptAt = now
        });
        return Task.FromResult(true);
    }

    public Task<bool> RevokeAsync(Guid inviteId, Guid adminUserId, DateTimeOffset now, CancellationToken cancellationToken)
    {
        if (!RevokeResult) return Task.FromResult(false);
        var invite = Invites.FirstOrDefault(i => i.Id == inviteId);
        if (invite is not null)
        {
            invite.RevokedAt = now;
            invite.DeliveryStatus = InviteDeliveryStatus.Revoked;
        }
        return Task.FromResult(true);
    }

    public Task<InviteEmailOutboxMessage?> ClaimNextOutboxMessageAsync(DateTimeOffset now, DateTimeOffset leaseExpiresAt, CancellationToken cancellationToken) =>
        Task.FromResult(Outbox.FirstOrDefault(m => m.Status == "pending"));

    public Task MarkOutboxMessageSentAsync(Guid outboxMessageId, string providerMessageId, DateTimeOffset sentAt, CancellationToken cancellationToken)
    {
        var msg = Outbox.FirstOrDefault(m => m.Id == outboxMessageId);
        if (msg is not null) { msg.Status = "sent"; msg.ProviderMessageId = providerMessageId; msg.SentAt = sentAt; }
        return Task.CompletedTask;
    }

    public Task ScheduleOutboxRetryAsync(Guid outboxMessageId, DateTimeOffset nextAttemptAt, string error, bool permanentlyFailed, CancellationToken cancellationToken)
    {
        var msg = Outbox.FirstOrDefault(m => m.Id == outboxMessageId);
        if (msg is not null) { msg.NextAttemptAt = nextAttemptAt; msg.LastError = error; msg.Status = permanentlyFailed ? "failed" : "pending"; }
        return Task.CompletedTask;
    }

    public Task<bool> RecordWebhookEventAsync(string eventId, string eventType, string? providerMessageId, DateTimeOffset receivedAt, CancellationToken cancellationToken)
    {
        WebhookEvents.Add((eventId, eventType, providerMessageId, receivedAt));
        return Task.FromResult(WebhookResult);
    }
}
