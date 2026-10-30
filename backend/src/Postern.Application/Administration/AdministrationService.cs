using System.Text.Json;
using Postern.Application.Accounts;
using Postern.Application.Aliases;
using Postern.Domain.Administration;

namespace Postern.Application.Administration;

public enum AdminOutcome
{
    Succeeded,
    NotFound,
    Invalid
}

public sealed class AdministrationService(
    IAccountRepository accounts,
    IAdministrationRepository administration,
    SuspendedUserService suspendedUsers,
    GlobalBlocklistService globalBlocklist,
    TimeProvider timeProvider)
{
    private const string SuspendedStatus = "suspended";
    private const string ActiveStatus = "active";
    private const string DefaultBlockReason = "administrator";

    public async Task<AdminOutcome> SuspendUserAsync(
        Guid adminUserId,
        Guid targetUserId,
        string? reason,
        CancellationToken cancellationToken)
    {
        var user = await accounts.FindByIdAsync(targetUserId, cancellationToken);
        if (user is null)
        {
            return AdminOutcome.NotFound;
        }

        if (user.Status != SuspendedStatus
            && !await accounts.SetStatusAsync(targetUserId, SuspendedStatus, cancellationToken))
        {
            return AdminOutcome.NotFound;
        }

        await RecordAuditAsync(adminUserId, "user.suspend", targetUserId.ToString(), reason, cancellationToken);
        await suspendedUsers.RebuildAsync(cancellationToken);
        return AdminOutcome.Succeeded;
    }

    public async Task<AdminOutcome> ResumeUserAsync(
        Guid adminUserId,
        Guid targetUserId,
        string? reason,
        CancellationToken cancellationToken)
    {
        var user = await accounts.FindByIdAsync(targetUserId, cancellationToken);
        if (user is null)
        {
            return AdminOutcome.NotFound;
        }

        if (user.Status != ActiveStatus
            && !await accounts.SetStatusAsync(targetUserId, ActiveStatus, cancellationToken))
        {
            return AdminOutcome.NotFound;
        }

        await RecordAuditAsync(adminUserId, "user.resume", targetUserId.ToString(), reason, cancellationToken);
        await suspendedUsers.RebuildAsync(cancellationToken);
        return AdminOutcome.Succeeded;
    }

    public async Task<AdminOutcome> BlockDomainAsync(
        Guid adminUserId,
        string? domain,
        string? reason,
        CancellationToken cancellationToken)
    {
        var normalized = Etld1Normalizer.Normalize(domain);
        if (normalized is null || normalized.Length > 253)
        {
            return AdminOutcome.Invalid;
        }

        await administration.AddBlockedDomainAsync(
            new GlobalBlockedDomain
            {
                DomainEtld1 = normalized,
                AddedByAdminUserId = adminUserId,
                Reason = NormalizeReason(reason),
                CreatedAt = timeProvider.GetUtcNow()
            },
            cancellationToken);

        await RecordAuditAsync(adminUserId, "global_blocklist.add", normalized, reason, cancellationToken);
        await globalBlocklist.RebuildAsync(cancellationToken);
        return AdminOutcome.Succeeded;
    }

    public async Task<AdminOutcome> UnblockDomainAsync(
        Guid adminUserId,
        string? domain,
        CancellationToken cancellationToken)
    {
        var normalized = Etld1Normalizer.Normalize(domain);
        if (normalized is null)
        {
            return AdminOutcome.Invalid;
        }

        if (!await administration.RemoveBlockedDomainAsync(normalized, cancellationToken))
        {
            return AdminOutcome.NotFound;
        }

        await RecordAuditAsync(adminUserId, "global_blocklist.remove", normalized, null, cancellationToken);
        await globalBlocklist.RebuildAsync(cancellationToken);
        return AdminOutcome.Succeeded;
    }

    public async Task<IReadOnlyCollection<string>> ListBlockedDomainsAsync(CancellationToken cancellationToken)
    {
        var stored = await administration.ListBlockedDomainsAsync(cancellationToken);
        return stored
            .Select(domain => domain.DomainEtld1)
            .OrderBy(domain => domain, StringComparer.Ordinal)
            .ToList();
    }

    private Task RecordAuditAsync(
        Guid adminUserId,
        string action,
        string? targetId,
        string? reason,
        CancellationToken cancellationToken) =>
        administration.RecordAuditEntryAsync(
            new AdminAuditLogEntry
            {
                Id = Guid.NewGuid(),
                AdminUserId = adminUserId,
                Action = action,
                TargetId = targetId,
                Metadata = string.IsNullOrWhiteSpace(reason)
                    ? null
                    : JsonSerializer.Serialize(new { reason = reason.Trim() }),
                CreatedAt = timeProvider.GetUtcNow()
            },
            cancellationToken);

    private static string NormalizeReason(string? reason)
    {
        if (string.IsNullOrWhiteSpace(reason))
        {
            return DefaultBlockReason;
        }

        var trimmed = reason.Trim();
        return trimmed.Length > 256 ? trimmed[..256] : trimmed;
    }
}
