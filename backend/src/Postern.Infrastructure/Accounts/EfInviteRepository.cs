using Microsoft.EntityFrameworkCore;
using Npgsql;
using Postern.Application.Accounts;
using Postern.Domain.Accounts;
using Postern.Domain.Administration;
using Postern.Infrastructure.Persistence;

namespace Postern.Infrastructure.Accounts;

public sealed class EfInviteRepository(PosternDbContext dbContext) : IInviteRepository
{
    public Task<string?> FindValidRecipientAsync(
        string codeHash,
        DateTimeOffset now,
        CancellationToken cancellationToken) =>
        dbContext.InviteCodes
            .AsNoTracking()
            .Where(invite =>
                invite.CodeHash == codeHash
                && invite.UsedAt == null
                && invite.RevokedAt == null
                && invite.ExpiresAt > now
                && invite.EmailNormalized != string.Empty)
            .Select(invite => invite.Email)
            .SingleOrDefaultAsync(cancellationToken);

    public async Task<IReadOnlyList<InviteEmailOutboxMessage>> ListPendingOutboxMessagesAsync(
        DateTimeOffset now,
        CancellationToken cancellationToken) =>
        await dbContext.InviteEmailOutbox
            .AsNoTracking()
            .Where(message =>
                message.Status == "pending"
                && message.ExpiresAt > now
                && dbContext.InviteCodes.Any(invite =>
                    invite.Id == message.InviteId
                    && invite.UsedAt == null
                    && invite.RevokedAt == null
                    && invite.ExpiresAt > now))
            .OrderBy(message => message.CreatedAt)
            .Take(100)
            .ToListAsync(cancellationToken);

    public async Task AddRequestAsync(InviteRequest request, CancellationToken cancellationToken)
    {
        dbContext.InviteRequests.Add(request);
        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsPendingRequestConflict(exception))
        {
            dbContext.Entry(request).State = EntityState.Detached;
        }
    }

    public async Task<IReadOnlyList<InviteRequest>> ListPendingRequestsAsync(
        CancellationToken cancellationToken) =>
        await dbContext.InviteRequests
            .AsNoTracking()
            .Where(request => request.Status == "pending")
            .OrderBy(request => request.RequestedAt)
            .Take(500)
            .ToListAsync(cancellationToken);

    public async Task<bool> ApproveRequestAsync(
        Guid requestId,
        Guid adminUserId,
        InviteCode invite,
        InviteEmailOutboxMessage outboxMessage,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var request = await dbContext.InviteRequests
            .FromSqlInterpolated(
                $"SELECT * FROM postern.invite_requests WHERE id = {requestId} AND status = 'pending' FOR UPDATE")
            .SingleOrDefaultAsync(cancellationToken);
        if (request is null)
        {
            return false;
        }

        invite.Email = request.Email;
        invite.EmailNormalized = request.EmailNormalized;
        outboxMessage.RecipientEmail = request.Email;
        request.Status = "approved";
        request.ReviewedAt = now;
        request.ReviewedByUserId = adminUserId;
        request.InviteId = invite.Id;
        dbContext.InviteCodes.Add(invite);
        dbContext.InviteEmailOutbox.Add(outboxMessage);
        AddAuditEntry(adminUserId, "invite_request.approved", requestId.ToString(), now);
        AddAuditEntry(adminUserId, "invite.created", invite.Id.ToString(), now, requestId.ToString());
        AddAuditEntry(adminUserId, "invite.approved", invite.Id.ToString(), now);
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    public async Task<bool> RejectRequestAsync(
        Guid requestId,
        Guid adminUserId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var request = await dbContext.InviteRequests
            .FromSqlInterpolated(
                $"SELECT * FROM postern.invite_requests WHERE id = {requestId} AND status = 'pending' FOR UPDATE")
            .SingleOrDefaultAsync(cancellationToken);
        if (request is null)
        {
            return false;
        }

        request.Status = "rejected";
        request.ReviewedAt = now;
        request.ReviewedByUserId = adminUserId;
        AddAuditEntry(adminUserId, "invite_request.rejected", requestId.ToString(), now);
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    public async Task<bool> ResendAsync(
        Guid inviteId,
        Guid adminUserId,
        string codeHash,
        string protectedCode,
        DateTimeOffset now,
        DateTimeOffset expiresAt,
        string inviterName,
        Guid outboxMessageId,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var invite = await dbContext.InviteCodes
            .SingleOrDefaultAsync(
                item => item.Id == inviteId && item.UsedAt == null && item.RevokedAt == null,
                cancellationToken);
        if (invite is null)
        {
            return false;
        }

        invite.CodeHash = codeHash;
        invite.ExpiresAt = expiresAt;
        invite.DeliveryStatus = InviteDeliveryStatus.Pending;
        invite.DeliveryMessageId = null;
        invite.DeliveryUpdatedAt = now;
        var oldPendingMessages = await dbContext.InviteEmailOutbox
            .Where(message =>
                message.InviteId == inviteId
                && (message.Status == "pending" || message.Status == "processing"))
            .ToListAsync(cancellationToken);
        foreach (var oldMessage in oldPendingMessages)
        {
            oldMessage.Status = "cancelled";
            oldMessage.ProtectedInviteCode = string.Empty;
            oldMessage.LeaseExpiresAt = null;
            oldMessage.LastError = "Superseded by a resent invitation.";
        }

        dbContext.InviteEmailOutbox.Add(new InviteEmailOutboxMessage
        {
            Id = outboxMessageId,
            InviteId = inviteId,
            RecipientEmail = invite.Email,
            ProtectedInviteCode = protectedCode,
            InviterName = inviterName,
            ExpiresAt = expiresAt,
            CreatedAt = now,
            NextAttemptAt = now
        });
        AddAuditEntry(adminUserId, "invite.resent", inviteId.ToString(), now);
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    public async Task<bool> RevokeAsync(
        Guid inviteId,
        Guid adminUserId,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var invite = await dbContext.InviteCodes.SingleOrDefaultAsync(
            item => item.Id == inviteId && item.UsedAt == null && item.RevokedAt == null,
            cancellationToken);
        if (invite is null)
        {
            return false;
        }

        invite.RevokedAt = now;
        invite.DeliveryStatus = InviteDeliveryStatus.Revoked;
        invite.DeliveryUpdatedAt = now;

        var queuedMessages = await dbContext.InviteEmailOutbox
            .Where(message => message.InviteId == inviteId && message.Status == "pending")
            .ToListAsync(cancellationToken);
        foreach (var message in queuedMessages)
        {
            message.Status = "cancelled";
            message.ProtectedInviteCode = string.Empty;
            message.LastError = "Invite revoked before delivery.";
        }

        AddAuditEntry(adminUserId, "invite.revoked", inviteId.ToString(), now);
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    public async Task<InviteEmailOutboxMessage?> ClaimNextOutboxMessageAsync(
        DateTimeOffset now,
        DateTimeOffset leaseExpiresAt,
        CancellationToken cancellationToken)
    {
        var expiredMessages = await dbContext.InviteEmailOutbox
            .Where(message =>
                (message.Status == "pending" || message.Status == "processing")
                && message.ExpiresAt <= now)
            .ToListAsync(cancellationToken);
        foreach (var expiredMessage in expiredMessages)
        {
            expiredMessage.Status = "cancelled";
            expiredMessage.ProtectedInviteCode = string.Empty;
            expiredMessage.LeaseExpiresAt = null;
            expiredMessage.LastError = "Invite expired before delivery.";
            AddAuditEntry(null, "invite.delivery_cancelled", expiredMessage.InviteId.ToString(), now, "expired");
        }
        if (expiredMessages.Count > 0)
        {
            foreach (var inviteId in expiredMessages.Select(message => message.InviteId).Distinct())
            {
                var expiredInvite = await dbContext.InviteCodes.SingleAsync(
                    invite => invite.Id == inviteId,
                    cancellationToken);
                if (expiredInvite.UsedAt is null && expiredInvite.RevokedAt is null)
                {
                    expiredInvite.DeliveryStatus = InviteDeliveryStatus.Failed;
                    expiredInvite.DeliveryUpdatedAt = now;
                }
            }
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        var candidateId = await dbContext.InviteEmailOutbox
            .AsNoTracking()
            .Where(message =>
                ((message.Status == "pending" && message.NextAttemptAt <= now)
                    || (message.Status == "processing" && message.LeaseExpiresAt <= now))
                && dbContext.InviteCodes.Any(invite =>
                    invite.Id == message.InviteId
                    && invite.UsedAt == null
                    && invite.RevokedAt == null
                    && invite.ExpiresAt > now))
            .OrderBy(message => message.NextAttemptAt)
            .ThenBy(message => message.CreatedAt)
            .Select(message => message.Id)
            .FirstOrDefaultAsync(cancellationToken);

        if (candidateId == Guid.Empty)
        {
            return null;
        }

        var claimed = await dbContext.InviteEmailOutbox
            .Where(message =>
                message.Id == candidateId
                && ((message.Status == "pending" && message.NextAttemptAt <= now)
                    || (message.Status == "processing" && message.LeaseExpiresAt <= now)))
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(message => message.Status, "processing")
                    .SetProperty(message => message.LeaseExpiresAt, leaseExpiresAt)
                    .SetProperty(message => message.AttemptCount, message => message.AttemptCount + 1),
                cancellationToken);

        if (claimed != 1)
        {
            return null;
        }

        return await dbContext.InviteEmailOutbox
            .AsNoTracking()
            .SingleOrDefaultAsync(message => message.Id == candidateId, cancellationToken);
    }

    public async Task MarkOutboxMessageSentAsync(
        Guid outboxMessageId,
        string providerMessageId,
        DateTimeOffset sentAt,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var message = await dbContext.InviteEmailOutbox
            .SingleAsync(item => item.Id == outboxMessageId, cancellationToken);
        message.Status = "sent";
        message.ProtectedInviteCode = string.Empty;
        message.LeaseExpiresAt = null;
        message.SentAt = sentAt;
        message.ProviderMessageId = providerMessageId;
        message.LastError = null;

        var invite = await dbContext.InviteCodes
            .SingleAsync(item => item.Id == message.InviteId, cancellationToken);
        if (invite.UsedAt is null && invite.RevokedAt is null)
        {
            var latestEventType = await dbContext.ResendWebhookEvents
                .AsNoTracking()
                .Where(webhookEvent => webhookEvent.ProviderMessageId == providerMessageId)
                .OrderByDescending(webhookEvent => webhookEvent.ReceivedAt)
                .Select(webhookEvent => webhookEvent.EventType)
                .FirstOrDefaultAsync(cancellationToken);
            invite.DeliveryStatus = latestEventType is null
                ? InviteDeliveryStatus.Sent
                : MapWebhookStatus(latestEventType) ?? InviteDeliveryStatus.Sent;
            invite.DeliveryMessageId = providerMessageId;
            invite.DeliveryUpdatedAt = sentAt;
        }

        AddAuditEntry(null, "invite.email_sent", invite.Id.ToString(), sentAt, providerMessageId);
        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    public async Task ScheduleOutboxRetryAsync(
        Guid outboxMessageId,
        DateTimeOffset nextAttemptAt,
        string error,
        bool permanentlyFailed,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        var message = await dbContext.InviteEmailOutbox
            .SingleAsync(item => item.Id == outboxMessageId, cancellationToken);
        message.Status = permanentlyFailed ? "failed" : "pending";
        message.LeaseExpiresAt = null;
        message.NextAttemptAt = nextAttemptAt;
        message.LastError = error.Length <= 500 ? error : error[..500];

        if (permanentlyFailed)
        {
            message.ProtectedInviteCode = string.Empty;
            var invite = await dbContext.InviteCodes
                .SingleAsync(item => item.Id == message.InviteId, cancellationToken);
            if (invite.UsedAt is null && invite.RevokedAt is null)
            {
                invite.DeliveryStatus = InviteDeliveryStatus.Failed;
                invite.DeliveryUpdatedAt = nextAttemptAt;
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
    }

    public async Task<bool> RecordWebhookEventAsync(
        string eventId,
        string eventType,
        string? providerMessageId,
        DateTimeOffset receivedAt,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        dbContext.ResendWebhookEvents.Add(new ResendWebhookEvent
        {
            Id = eventId,
            EventType = eventType,
            ProviderMessageId = providerMessageId,
            ReceivedAt = receivedAt
        });

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsDuplicateWebhook(exception))
        {
            await transaction.RollbackAsync(cancellationToken);
            dbContext.Entry(dbContext.ResendWebhookEvents.Local.Single(item => item.Id == eventId)).State =
                EntityState.Detached;
            return false;
        }

        if (!string.IsNullOrWhiteSpace(providerMessageId))
        {
            var deliveryStatus = MapWebhookStatus(eventType);
            if (deliveryStatus is not null)
            {
                var invite = await dbContext.InviteCodes
                    .SingleOrDefaultAsync(
                        item => item.DeliveryMessageId == providerMessageId,
                        cancellationToken);
                if (invite is not null
                    && invite.UsedAt is null
                    && invite.RevokedAt is null
                    && invite.DeliveryStatus is not InviteDeliveryStatus.Bounced
                        and not InviteDeliveryStatus.Complained)
                {
                    invite.DeliveryStatus = deliveryStatus;
                    invite.DeliveryUpdatedAt = receivedAt;
                    AddAuditEntry(null, $"invite.{deliveryStatus}", invite.Id.ToString(), receivedAt, eventId);
                }
            }
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await transaction.CommitAsync(cancellationToken);
        return true;
    }

    private void AddAuditEntry(
        Guid? adminUserId,
        string action,
        string? targetId,
        DateTimeOffset createdAt,
        string? detail = null) =>
        dbContext.AdminAuditLog.Add(new AdminAuditLogEntry
        {
            Id = Guid.NewGuid(),
            AdminUserId = adminUserId,
            Action = action,
            TargetId = targetId,
            Metadata = detail is null ? null : System.Text.Json.JsonSerializer.Serialize(new { detail }),
            CreatedAt = createdAt
        });

    private static bool IsPendingRequestConflict(DbUpdateException exception) =>
        exception.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.UniqueViolation,
            ConstraintName: "ux_invite_requests_pending_email"
        };

    private static bool IsDuplicateWebhook(DbUpdateException exception) =>
        exception.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.UniqueViolation,
            ConstraintName: "PK_resend_webhook_events"
        };

    private static string? MapWebhookStatus(string eventType) =>
        eventType switch
        {
            "email.sent" => InviteDeliveryStatus.Sent,
            "email.delivered" => InviteDeliveryStatus.Delivered,
            "email.bounced" => InviteDeliveryStatus.Bounced,
            "email.complained" => InviteDeliveryStatus.Complained,
            _ => null
        };
}
