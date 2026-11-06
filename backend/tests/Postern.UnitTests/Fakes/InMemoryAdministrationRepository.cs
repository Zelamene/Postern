using Postern.Application.Administration;
using Postern.Domain.Administration;

namespace Postern.UnitTests.Fakes;

public sealed class InMemoryAdministrationRepository : IAdministrationRepository
{
    private readonly Dictionary<string, GlobalBlockedDomain> _domains = new(StringComparer.Ordinal);

    public List<AdminAuditLogEntry> AuditEntries { get; } = [];

    public List<AdminKvSyncAlias> DirtyAliases { get; } = [];

    public List<Guid> ClearedAliasIds { get; } = [];

    public AdminAnalyticsData? Analytics { get; set; }

    public DateTimeOffset? AnalyticsSince { get; private set; }

    public DateTimeOffset? AnalyticsAuditSince { get; private set; }

    public int? AnalyticsRecentAuditLimit { get; private set; }

    public int DeletedMessages { get; set; }

    public int DeletedBlockedMessages { get; set; }

    public int DeletedWebhookEvents { get; set; }

    public int DeletedInviteRequests { get; set; }

    public DateTimeOffset? MessagesCutoff { get; private set; }

    public DateTimeOffset? BlockedMessagesCutoff { get; private set; }

    public DateTimeOffset? WebhookEventsCutoff { get; private set; }

    public DateTimeOffset? InviteRequestsCutoff { get; private set; }

    public IReadOnlyCollection<GlobalBlockedDomain> Domains => _domains.Values;

    public void Seed(GlobalBlockedDomain domain) => _domains[domain.DomainEtld1] = domain;

    public Task<bool> AddBlockedDomainAsync(GlobalBlockedDomain domain, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (_domains.ContainsKey(domain.DomainEtld1))
        {
            return Task.FromResult(false);
        }

        _domains[domain.DomainEtld1] = domain;
        return Task.FromResult(true);
    }

    public Task<bool> RemoveBlockedDomainAsync(string domainEtld1, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_domains.Remove(domainEtld1));
    }

    public Task<IReadOnlyCollection<GlobalBlockedDomain>> ListBlockedDomainsAsync(
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult<IReadOnlyCollection<GlobalBlockedDomain>>(_domains.Values.ToList());
    }

    public Task<AdminAnalyticsData> GetAnalyticsAsync(
        DateTimeOffset since,
        DateTimeOffset auditSince,
        int recentAuditLimit,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        AnalyticsSince = since;
        AnalyticsAuditSince = auditSince;
        AnalyticsRecentAuditLimit = recentAuditLimit;
        if (Analytics is not null)
        {
            return Task.FromResult(Analytics);
        }

        return Task.FromResult(new AdminAnalyticsData(
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            _domains.Count,
            0,
            [],
            [],
            [],
            [],
            [],
            [],
            AuditEntries
                .Where(entry => entry.CreatedAt >= auditSince)
                .OrderByDescending(entry => entry.CreatedAt)
                .Take(recentAuditLimit)
                .ToList()));
    }

    public Task<IReadOnlyCollection<AdminKvSyncAlias>> ListDirtyAliasesAsync(
        int limit,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult<IReadOnlyCollection<AdminKvSyncAlias>>(
            DirtyAliases.Take(limit).ToList());
    }

    public Task<int> CountDirtyAliasesAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(DirtyAliases.Count);
    }

    public Task ClearKvDirtyAsync(
        IReadOnlyCollection<Guid> aliasIds,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ClearedAliasIds.AddRange(aliasIds);
        DirtyAliases.RemoveAll(alias => aliasIds.Contains(alias.AliasId));
        return Task.CompletedTask;
    }

    public Task<int> DeleteMessagesBeforeAsync(DateTimeOffset cutoff, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        MessagesCutoff = cutoff;
        return Task.FromResult(DeletedMessages);
    }

    public Task<int> DeleteBlockedMessagesBeforeAsync(
        DateTimeOffset cutoff,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        BlockedMessagesCutoff = cutoff;
        return Task.FromResult(DeletedBlockedMessages);
    }

    public Task<int> DeleteWebhookEventsBeforeAsync(
        DateTimeOffset cutoff,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        WebhookEventsCutoff = cutoff;
        return Task.FromResult(DeletedWebhookEvents);
    }

    public Task<int> DeletePendingInviteRequestsBeforeAsync(
        DateTimeOffset cutoff,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        InviteRequestsCutoff = cutoff;
        return Task.FromResult(DeletedInviteRequests);
    }

    public Task RecordAuditEntryAsync(AdminAuditLogEntry entry, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        AuditEntries.Add(entry);
        return Task.CompletedTask;
    }
}
