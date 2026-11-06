using Postern.Domain.Administration;

namespace Postern.Application.Administration;

public sealed record AdminAnalyticsData(
    int RegisteredUsers,
    int PendingInviteRequests,
    int Aliases,
    int ActiveAliases,
    int ForwardedMessages,
    int BlockedMessages,
    int UnexpectedSenderMessages,
    int BlocklistedDomains,
    int KvDirtyAliases,
    IReadOnlyList<DateTimeOffset> ForwardedTimestamps,
    IReadOnlyList<DateTimeOffset> BlockedTimestamps,
    IReadOnlyList<AdminDistributionItem> AliasStatuses,
    IReadOnlyList<AdminDistributionItem> AuthenticationResults,
    IReadOnlyList<AdminSenderDomain> SenderDomains,
    IReadOnlyList<AdminBlockReason> BlockedReasons,
    IReadOnlyList<AdminAuditLogEntry> RecentAudit);

public sealed record AdminKvSyncAlias(
    Guid AliasId,
    string FullAddress,
    Guid UserId,
    string Destination,
    string Status);

public interface IAdministrationRepository
{
    Task<bool> AddBlockedDomainAsync(GlobalBlockedDomain domain, CancellationToken cancellationToken);

    Task<bool> RemoveBlockedDomainAsync(string domainEtld1, CancellationToken cancellationToken);

    Task<IReadOnlyCollection<GlobalBlockedDomain>> ListBlockedDomainsAsync(CancellationToken cancellationToken);

    Task<AdminAnalyticsData> GetAnalyticsAsync(
        DateTimeOffset since,
        DateTimeOffset auditSince,
        int recentAuditLimit,
        CancellationToken cancellationToken);

    Task<IReadOnlyCollection<AdminKvSyncAlias>> ListDirtyAliasesAsync(
        int limit,
        CancellationToken cancellationToken);

    Task<int> CountDirtyAliasesAsync(CancellationToken cancellationToken);

    Task ClearKvDirtyAsync(
        IReadOnlyCollection<Guid> aliasIds,
        CancellationToken cancellationToken);

    Task<int> DeleteMessagesBeforeAsync(DateTimeOffset cutoff, CancellationToken cancellationToken);

    Task<int> DeleteBlockedMessagesBeforeAsync(DateTimeOffset cutoff, CancellationToken cancellationToken);

    Task<int> DeleteWebhookEventsBeforeAsync(DateTimeOffset cutoff, CancellationToken cancellationToken);

    Task<int> DeletePendingInviteRequestsBeforeAsync(DateTimeOffset cutoff, CancellationToken cancellationToken);

    Task RecordAuditEntryAsync(AdminAuditLogEntry entry, CancellationToken cancellationToken);
}
