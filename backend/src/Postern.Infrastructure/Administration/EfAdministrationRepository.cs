using Microsoft.EntityFrameworkCore;
using Postern.Application.Administration;
using Postern.Application.Aliases;
using Postern.Domain.Administration;
using Postern.Domain.Aliases;
using Postern.Infrastructure.Persistence;

namespace Postern.Infrastructure.Administration;

public sealed class EfAdministrationRepository(PosternDbContext dbContext) : IAdministrationRepository
{
    public async Task<bool> AddBlockedDomainAsync(
        GlobalBlockedDomain domain,
        CancellationToken cancellationToken)
    {
        var exists = await dbContext.GlobalBlocklist
            .AnyAsync(item => item.DomainEtld1 == domain.DomainEtld1, cancellationToken);
        if (exists)
        {
            return false;
        }

        dbContext.GlobalBlocklist.Add(domain);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> RemoveBlockedDomainAsync(
        string domainEtld1,
        CancellationToken cancellationToken) =>
        await dbContext.GlobalBlocklist
            .Where(item => item.DomainEtld1 == domainEtld1)
            .ExecuteDeleteAsync(cancellationToken) == 1;

    public async Task<IReadOnlyCollection<GlobalBlockedDomain>> ListBlockedDomainsAsync(
        CancellationToken cancellationToken) =>
        await dbContext.GlobalBlocklist
            .AsNoTracking()
            .OrderBy(item => item.DomainEtld1)
            .ToListAsync(cancellationToken);

    public async Task<AdminAnalyticsData> GetAnalyticsAsync(
        DateTimeOffset since,
        DateTimeOffset auditSince,
        int recentAuditLimit,
        CancellationToken cancellationToken)
    {
        var registeredUsers = await dbContext.Users.CountAsync(cancellationToken);
        var pendingInviteRequests = await dbContext.InviteRequests
            .CountAsync(request => request.Status == "pending", cancellationToken);
        var aliases = await dbContext.Aliases.CountAsync(cancellationToken);
        var activeAliases = await dbContext.Aliases
            .CountAsync(alias => alias.Status == AliasStatus.Active, cancellationToken);
        var forwardedMessages = await dbContext.Messages
            .CountAsync(message => message.ReceivedAt >= since, cancellationToken);
        var blockedMessages = await dbContext.BlockedMessages
            .CountAsync(message => message.ReceivedAt >= since, cancellationToken);
        var unexpectedSenderMessages = await dbContext.Messages
            .CountAsync(message => message.ReceivedAt >= since && message.IsFlagged, cancellationToken);
        var blocklistedDomains = await dbContext.GlobalBlocklist.CountAsync(cancellationToken);
        var kvDirtyAliases = await dbContext.Aliases
            .CountAsync(alias => alias.KvDirty, cancellationToken);

        var forwardedTimestamps = await dbContext.Messages
            .AsNoTracking()
            .Where(message => message.ReceivedAt >= since)
            .Select(message => message.ReceivedAt)
            .ToListAsync(cancellationToken);
        var blockedTimestamps = await dbContext.BlockedMessages
            .AsNoTracking()
            .Where(message => message.ReceivedAt >= since)
            .Select(message => message.ReceivedAt)
            .ToListAsync(cancellationToken);

        var aliasStatusCounts = await dbContext.Aliases
            .AsNoTracking()
            .GroupBy(alias => alias.Status)
            .Select(group => new { Status = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);
        var aliasStatuses = aliasStatusCounts
            .Select(item => new AdminDistributionItem(
                item.Status.ToString().ToLowerInvariant(),
                item.Count))
            .ToArray();

        var authenticationCounts = await dbContext.Messages
            .AsNoTracking()
            .Where(message => message.ReceivedAt >= since)
            .GroupBy(message => message.AuthenticationResult)
            .Select(group => new { Result = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);
        var authenticationResults = authenticationCounts
            .Select(item => new AdminDistributionItem(
                item.Result.ToLowerInvariant(),
                item.Count))
            .ToArray();

        var blockReasonCounts = await dbContext.BlockedMessages
            .AsNoTracking()
            .Where(message => message.ReceivedAt >= since)
            .GroupBy(message => message.Reason)
            .Select(group => new { Reason = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);
        var blockedReasons = blockReasonCounts
            .Select(item => new AdminBlockReason(item.Reason, item.Count))
            .ToArray();

        var flaggedSenders = await dbContext.Messages
            .AsNoTracking()
            .Where(message => message.ReceivedAt >= since && message.IsFlagged)
            .Select(message => message.FromHeader)
            .ToListAsync(cancellationToken);
        var blockedSenders = await dbContext.BlockedMessages
            .AsNoTracking()
            .Where(message => message.ReceivedAt >= since)
            .Select(message => message.FromHeader)
            .ToListAsync(cancellationToken);
        var senderDomains = flaggedSenders
            .Concat(blockedSenders)
            .Select(Etld1Normalizer.Normalize)
            .Where(domain => !string.IsNullOrWhiteSpace(domain))
            .GroupBy(domain => domain!, StringComparer.OrdinalIgnoreCase)
            .Select(group => new AdminSenderDomain(group.Key, group.Count()))
            .ToArray();

        var recentAudit = await dbContext.AdminAuditLog
            .AsNoTracking()
            .Where(entry => entry.CreatedAt >= auditSince)
            .OrderByDescending(entry => entry.CreatedAt)
            .Take(recentAuditLimit)
            .ToListAsync(cancellationToken);

        return new AdminAnalyticsData(
            registeredUsers,
            pendingInviteRequests,
            aliases,
            activeAliases,
            forwardedMessages,
            blockedMessages,
            unexpectedSenderMessages,
            blocklistedDomains,
            kvDirtyAliases,
            forwardedTimestamps,
            blockedTimestamps,
            aliasStatuses,
            authenticationResults,
            senderDomains,
            blockedReasons,
            recentAudit);
    }

    public async Task<IReadOnlyCollection<AdminKvSyncAlias>> ListDirtyAliasesAsync(
        int limit,
        CancellationToken cancellationToken)
    {
        var rows = await dbContext.Aliases
            .AsNoTracking()
            .Where(alias => alias.KvDirty
                && alias.UserId != null
                && alias.FullAddress != null)
            .OrderBy(alias => alias.CreatedAt)
            .Take(limit)
            .Select(alias => new
            {
                AliasId = alias.Id,
                FullAddress = alias.FullAddress!,
                UserId = alias.UserId!.Value,
                Destination = alias.User!.ForwardingAddress ?? alias.User.Email,
                alias.Status
            })
            .ToListAsync(cancellationToken);

        return rows
            .Select(row => new AdminKvSyncAlias(
                row.AliasId,
                row.FullAddress,
                row.UserId,
                row.Destination,
                row.Status.ToString().ToLowerInvariant()))
            .ToArray();
    }

    public Task<int> CountDirtyAliasesAsync(CancellationToken cancellationToken) =>
        dbContext.Aliases.CountAsync(alias => alias.KvDirty, cancellationToken);

    public async Task ClearKvDirtyAsync(
        IReadOnlyCollection<Guid> aliasIds,
        CancellationToken cancellationToken)
    {
        if (aliasIds.Count == 0)
        {
            return;
        }

        await dbContext.Aliases
            .Where(alias => aliasIds.Contains(alias.Id))
            .ExecuteUpdateAsync(
                setters => setters.SetProperty(alias => alias.KvDirty, false),
                cancellationToken);
    }

    public Task<int> DeleteMessagesBeforeAsync(
        DateTimeOffset cutoff,
        CancellationToken cancellationToken) =>
        dbContext.Messages
            .Where(message => message.ReceivedAt < cutoff)
            .ExecuteDeleteAsync(cancellationToken);

    public Task<int> DeleteBlockedMessagesBeforeAsync(
        DateTimeOffset cutoff,
        CancellationToken cancellationToken) =>
        dbContext.BlockedMessages
            .Where(message => message.ReceivedAt < cutoff)
            .ExecuteDeleteAsync(cancellationToken);

    public Task<int> DeleteWebhookEventsBeforeAsync(
        DateTimeOffset cutoff,
        CancellationToken cancellationToken) =>
        dbContext.ResendWebhookEvents
            .Where(webhookEvent => webhookEvent.ReceivedAt < cutoff)
            .ExecuteDeleteAsync(cancellationToken);

    public Task<int> DeletePendingInviteRequestsBeforeAsync(
        DateTimeOffset cutoff,
        CancellationToken cancellationToken) =>
        dbContext.InviteRequests
            .Where(request => request.Status == "pending" && request.RequestedAt < cutoff)
            .ExecuteDeleteAsync(cancellationToken);

    public async Task RecordAuditEntryAsync(
        AdminAuditLogEntry entry,
        CancellationToken cancellationToken)
    {
        dbContext.AdminAuditLog.Add(entry);
        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
