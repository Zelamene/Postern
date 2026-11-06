using System.Security.Cryptography;
using Postern.Domain.Accounts;

namespace Postern.Application.Accounts;

public sealed record PendingInviteRequest(Guid Id, string Email, DateTimeOffset RequestedAt);
public sealed record DevelopmentInvite(Guid Id, string Email, string Code, DateTimeOffset ExpiresAt);
public sealed record AdminInvite(
    Guid Id,
    string Email,
    string Status,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ExpiresAt,
    bool CanResend,
    bool CanRevoke);
public sealed record AdminInviteDashboard(
    IReadOnlyList<AdminInvite> Invites,
    int SeatsFree,
    int OutstandingInvites);

public sealed class InviteManagementService(
    IInviteRepository invites,
    IInviteCodeProtector codeProtector,
    TimeProvider timeProvider)
{
    private static readonly TimeSpan InviteLifetime = TimeSpan.FromDays(7);

    public async Task<AdminInviteDashboard> GetAdminDashboardAsync(
        CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        var data = await invites.GetAdminDashboardAsync(now, cancellationToken);
        var items = data.Invites
            .Select(invite => new AdminInvite(
                invite.Id,
                invite.Email,
                GetAdminStatus(invite, now),
                invite.CreatedAt,
                invite.ExpiresAt,
                invite.UsedAt is null && invite.RevokedAt is null,
                invite.UsedAt is null && invite.RevokedAt is null))
            .ToArray();

        return new AdminInviteDashboard(
            items,
            Math.Max(0, AuthenticationService.MaximumUsers
                - data.RegisteredUsers
                - data.OutstandingInvites),
            data.OutstandingInvites);
    }

    public async Task RequestInviteAsync(string? email, CancellationToken cancellationToken)
    {
        if (!EmailAddressNormalizer.TryNormalize(email, out var normalizedEmail))
        {
            throw new ArgumentException("A valid email address is required.", nameof(email));
        }

        await invites.AddRequestAsync(
            new InviteRequest
            {
                Id = Guid.NewGuid(),
                Email = normalizedEmail,
                EmailNormalized = EmailAddressNormalizer.NormalizeIdentity(normalizedEmail),
                RequestedAt = timeProvider.GetUtcNow()
            },
            cancellationToken);
    }

    public Task<string?> FindValidRecipientAsync(
        string? inviteCode,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(inviteCode) || inviteCode.Length > 128)
        {
            return Task.FromResult<string?>(null);
        }

        return invites.FindValidRecipientAsync(
            AuthenticationService.HashInviteCode(inviteCode),
            timeProvider.GetUtcNow(),
            cancellationToken);
    }

    public async Task<IReadOnlyList<DevelopmentInvite>> ListPendingDevelopmentInvitesAsync(
        CancellationToken cancellationToken)
    {
        var messages = await invites.ListPendingOutboxMessagesAsync(
            timeProvider.GetUtcNow(),
            cancellationToken);

        return messages
            .Select(message => new DevelopmentInvite(
                message.InviteId,
                message.RecipientEmail,
                codeProtector.Unprotect(message.ProtectedInviteCode),
                message.ExpiresAt))
            .ToArray();
    }

    public async Task<IReadOnlyList<PendingInviteRequest>> ListPendingRequestsAsync(
        CancellationToken cancellationToken) =>
        (await invites.ListPendingRequestsAsync(cancellationToken))
        .Select(request => new PendingInviteRequest(request.Id, request.Email, request.RequestedAt))
        .ToArray();

    public async Task<bool> ApproveRequestAsync(
        Guid requestId,
        Guid adminUserId,
        string inviterName,
        CancellationToken cancellationToken)
    {
        var request = await invites.GetPendingRequestAsync(requestId, cancellationToken);
        if (request is null)
        {
            return false;
        }

        var now = timeProvider.GetUtcNow();
        var expiresAt = now.Add(InviteLifetime);
        var inviteCode = GenerateInviteCode();
        var invite = new InviteCode
        {
            Id = Guid.NewGuid(),
            CodeHash = AuthenticationService.HashInviteCode(inviteCode),
            Email = request.Email,
            EmailNormalized = request.EmailNormalized,
            CreatedAt = now,
            ExpiresAt = expiresAt,
            DeliveryStatus = InviteDeliveryStatus.Pending
        };
        var outboxMessage = new InviteEmailOutboxMessage
        {
            Id = Guid.NewGuid(),
            InviteId = invite.Id,
            RecipientEmail = request.Email,
            ProtectedInviteCode = codeProtector.Protect(inviteCode),
            InviterName = NormalizeInviterName(inviterName),
            ExpiresAt = expiresAt,
            CreatedAt = now,
            NextAttemptAt = now
        };

        return await invites.ApproveRequestAsync(
            requestId,
            adminUserId,
            invite,
            outboxMessage,
            now,
            cancellationToken);
    }

    public async Task<bool> RejectRequestAsync(
        Guid requestId,
        Guid adminUserId,
        CancellationToken cancellationToken) =>
        await invites.RejectRequestAsync(
            requestId,
            adminUserId,
            timeProvider.GetUtcNow(),
            cancellationToken);

    public async Task<bool> ResendAsync(
        Guid inviteId,
        Guid adminUserId,
        string inviterName,
        CancellationToken cancellationToken)
    {
        var now = timeProvider.GetUtcNow();
        var expiresAt = now.Add(InviteLifetime);
        var inviteCode = GenerateInviteCode();

        return await invites.ResendAsync(
            inviteId,
            adminUserId,
            AuthenticationService.HashInviteCode(inviteCode),
            codeProtector.Protect(inviteCode),
            now,
            expiresAt,
            NormalizeInviterName(inviterName),
            Guid.NewGuid(),
            cancellationToken);
    }

    public async Task<bool> RevokeAsync(
        Guid inviteId,
        Guid adminUserId,
        CancellationToken cancellationToken) =>
        await invites.RevokeAsync(inviteId, adminUserId, timeProvider.GetUtcNow(), cancellationToken);

    public Task<bool> RecordWebhookEventAsync(
        string eventId,
        string eventType,
        string? providerMessageId,
        CancellationToken cancellationToken) =>
        invites.RecordWebhookEventAsync(
            eventId,
            eventType,
            providerMessageId,
            timeProvider.GetUtcNow(),
            cancellationToken);

    private static string GenerateInviteCode() =>
        $"postern_invite_{Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_')}";

    private static string GetAdminStatus(AdminInviteRecord invite, DateTimeOffset now)
    {
        if (invite.RevokedAt is not null)
        {
            return InviteDeliveryStatus.Revoked;
        }

        if (invite.UsedAt is not null)
        {
            return InviteDeliveryStatus.Accepted;
        }

        if (invite.ExpiresAt <= now)
        {
            return "expired";
        }

        return invite.DeliveryStatus;
    }

    private static string NormalizeInviterName(string inviterName) =>
        string.IsNullOrWhiteSpace(inviterName) ? "An admin" : inviterName.Trim()[..Math.Min(inviterName.Trim().Length, 100)];
}
