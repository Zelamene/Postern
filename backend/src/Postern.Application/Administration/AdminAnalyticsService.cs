using Postern.Domain.Administration;

namespace Postern.Application.Administration;

public sealed record AdminAnalyticsTotals(
    int RegisteredUsers,
    int PendingInviteRequests,
    int Aliases,
    int ActiveAliases,
    int ForwardedMessages,
    int BlockedMessages,
    int UnexpectedSenderMessages,
    int BlocklistedDomains,
    int KvDirtyAliases);

public sealed record AdminHourlyIngestion(DateTimeOffset Hour, int Forwarded, int Blocked);

public sealed record AdminDistributionItem(string Key, int Count);

public sealed record AdminSenderDomain(string Domain, int Count);

public sealed record AdminBlockReason(string Reason, int Count);

public sealed record AdminAuditEntry(
    Guid Id,
    string Action,
    string? TargetId,
    string? Metadata,
    DateTimeOffset CreatedAt);

public sealed record AdminAnalytics(
    DateTimeOffset GeneratedAt,
    int WindowHours,
    int MinimumDomainVolume,
    AdminAnalyticsTotals Totals,
    IReadOnlyList<AdminHourlyIngestion> HourlyIngestion,
    IReadOnlyList<AdminDistributionItem> AliasStatuses,
    IReadOnlyList<AdminDistributionItem> AuthenticationResults,
    IReadOnlyList<AdminSenderDomain> SenderDomains,
    int HiddenSenderDomains,
    IReadOnlyList<AdminBlockReason> BlockedReasons,
    IReadOnlyList<AdminAuditEntry> RecentAudit);

public sealed class AdminAnalyticsService(
    IAdministrationRepository administration,
    TimeProvider timeProvider)
{
    public const int DefaultWindowHours = 24;
    public const int MaximumWindowHours = 168;
    public const int DefaultMinimumDomainVolume = 3;
    public const int MaximumMinimumDomainVolume = 100;
    public const int MaximumVisibleSenderDomains = 8;
    public const int RecentAuditLimit = 12;

    private static readonly TimeSpan AuditWindow = TimeSpan.FromDays(30);
    private static readonly string[] AliasStatuses = ["active", "disabled", "replaced", "deleted"];
    private static readonly string[] AuthenticationResults = ["pass", "none", "fail", "unknown"];

    public async Task<AdminAnalytics> GetAsync(
        int? windowHours,
        int? minimumDomainVolume,
        CancellationToken cancellationToken)
    {
        var hours = NormalizeWindowHours(windowHours);
        var threshold = NormalizeMinimumDomainVolume(minimumDomainVolume);
        var now = timeProvider.GetUtcNow();
        var since = now.AddHours(-hours);

        var data = await administration.GetAnalyticsAsync(
            since,
            now - AuditWindow,
            RecentAuditLimit,
            cancellationToken);

        var senderDomains = data.SenderDomains
            .Where(domain => domain.Count >= threshold)
            .OrderByDescending(domain => domain.Count)
            .ThenBy(domain => domain.Domain, StringComparer.Ordinal)
            .Take(MaximumVisibleSenderDomains)
            .ToArray();

        return new AdminAnalytics(
            now,
            hours,
            threshold,
            new AdminAnalyticsTotals(
                data.RegisteredUsers,
                data.PendingInviteRequests,
                data.Aliases,
                data.ActiveAliases,
                data.ForwardedMessages,
                data.BlockedMessages,
                data.UnexpectedSenderMessages,
                data.BlocklistedDomains,
                data.KvDirtyAliases),
            BuildHourlyIngestion(now, hours, data.ForwardedTimestamps, data.BlockedTimestamps),
            MergeDistribution(data.AliasStatuses, AliasStatuses),
            MergeDistribution(data.AuthenticationResults, AuthenticationResults),
            senderDomains,
            data.SenderDomains.Count(domain => domain.Count < threshold),
            data.BlockedReasons
                .OrderByDescending(reason => reason.Count)
                .ThenBy(reason => reason.Reason, StringComparer.Ordinal)
                .ToArray(),
            data.RecentAudit
                .Select(entry => new AdminAuditEntry(
                    entry.Id,
                    entry.Action,
                    entry.TargetId,
                    entry.Metadata,
                    entry.CreatedAt))
                .ToArray());
    }

    public static int NormalizeWindowHours(int? windowHours) =>
        windowHours is null or <= 0
            ? DefaultWindowHours
            : Math.Min(windowHours.Value, MaximumWindowHours);

    public static int NormalizeMinimumDomainVolume(int? minimumDomainVolume) =>
        minimumDomainVolume is null or <= 0
            ? DefaultMinimumDomainVolume
            : Math.Min(minimumDomainVolume.Value, MaximumMinimumDomainVolume);

    private static IReadOnlyList<AdminHourlyIngestion> BuildHourlyIngestion(
        DateTimeOffset now,
        int hours,
        IReadOnlyList<DateTimeOffset> forwardedTimestamps,
        IReadOnlyList<DateTimeOffset> blockedTimestamps)
    {
        var currentHour = new DateTimeOffset(
            now.UtcDateTime.AddTicks(-(now.UtcTicks % TimeSpan.TicksPerHour)),
            TimeSpan.Zero);
        var firstHour = currentHour.AddHours(-(hours - 1));
        var forwarded = new int[hours];
        var blocked = new int[hours];

        CountIntoBuckets(forwardedTimestamps, firstHour, hours, forwarded);
        CountIntoBuckets(blockedTimestamps, firstHour, hours, blocked);

        return Enumerable.Range(0, hours)
            .Select(index => new AdminHourlyIngestion(
                firstHour.AddHours(index),
                forwarded[index],
                blocked[index]))
            .ToArray();
    }

    private static void CountIntoBuckets(
        IReadOnlyList<DateTimeOffset> timestamps,
        DateTimeOffset firstHour,
        int hours,
        int[] buckets)
    {
        foreach (var timestamp in timestamps)
        {
            var index = (int)Math.Floor((timestamp.ToUniversalTime() - firstHour).TotalHours);
            if (index >= 0 && index < hours)
            {
                buckets[index] += 1;
            }
        }
    }

    private static IReadOnlyList<AdminDistributionItem> MergeDistribution(
        IReadOnlyList<AdminDistributionItem> stored,
        IReadOnlyList<string> keys)
    {
        var counts = stored.ToDictionary(item => item.Key, item => item.Count, StringComparer.OrdinalIgnoreCase);
        return keys
            .Select(key => new AdminDistributionItem(
                key,
                counts.TryGetValue(key, out var count) ? count : 0))
            .ToArray();
    }
}
