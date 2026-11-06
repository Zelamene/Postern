using Postern.Application.Administration;
using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public class AdminAnalyticsServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 30, 12, 34, 0, TimeSpan.Zero);

    [Fact]
    public async Task GetAsync_HidesLowVolumeDomainsAndReportsTheHiddenCount()
    {
        var context = new Context();
        context.Administration.Analytics = EmptyData() with
        {
            SenderDomains =
            [
                new AdminSenderDomain("high.example", 5),
                new AdminSenderDomain("low.example", 1),
                new AdminSenderDomain("medium.example", 3),
                new AdminSenderDomain("another-low.example", 2)
            ]
        };

        var analytics = await context.Service.GetAsync(null, null, CancellationToken.None);

        Assert.Equal(AdminAnalyticsService.DefaultMinimumDomainVolume, analytics.MinimumDomainVolume);
        Assert.Equal(2, analytics.HiddenSenderDomains);
        Assert.Equal(
            new[] { new AdminSenderDomain("high.example", 5), new AdminSenderDomain("medium.example", 3) },
            analytics.SenderDomains);
    }

    [Fact]
    public async Task GetAsync_OrdersVisibleDomainsByVolumeAndKeepsAtMostEight()
    {
        var context = new Context();
        context.Administration.Analytics = EmptyData() with
        {
            SenderDomains =
            [
                new AdminSenderDomain("i.example", 3),
                new AdminSenderDomain("h.example", 4),
                new AdminSenderDomain("g.example", 5),
                new AdminSenderDomain("f.example", 6),
                new AdminSenderDomain("e.example", 7),
                new AdminSenderDomain("d.example", 8),
                new AdminSenderDomain("c.example", 9),
                new AdminSenderDomain("b.example", 9),
                new AdminSenderDomain("a.example", 10)
            ]
        };

        var analytics = await context.Service.GetAsync(null, 1, CancellationToken.None);

        Assert.Equal(AdminAnalyticsService.MaximumVisibleSenderDomains, analytics.SenderDomains.Count);
        Assert.Equal(
            new[]
            {
                "a.example",
                "b.example",
                "c.example",
                "d.example",
                "e.example",
                "f.example",
                "g.example",
                "h.example"
            },
            analytics.SenderDomains.Select(domain => domain.Domain));
        Assert.Equal(0, analytics.HiddenSenderDomains);
    }

    [Fact]
    public async Task GetAsync_BucketsIngestionByHourAndIgnoresOutOfRangeTimestamps()
    {
        var context = new Context();
        context.Administration.Analytics = EmptyData() with
        {
            ForwardedTimestamps =
            [
                new DateTimeOffset(2026, 10, 30, 10, 5, 0, TimeSpan.Zero),
                new DateTimeOffset(2026, 10, 30, 10, 59, 59, TimeSpan.Zero),
                new DateTimeOffset(2026, 10, 30, 11, 30, 0, TimeSpan.Zero),
                new DateTimeOffset(2026, 10, 30, 12, 34, 0, TimeSpan.Zero),
                new DateTimeOffset(2026, 10, 30, 9, 59, 0, TimeSpan.Zero),
                new DateTimeOffset(2026, 10, 30, 13, 5, 0, TimeSpan.Zero)
            ],
            BlockedTimestamps =
            [
                new DateTimeOffset(2026, 10, 30, 11, 15, 0, TimeSpan.Zero),
                new DateTimeOffset(2026, 10, 30, 12, 0, 0, TimeSpan.Zero)
            ]
        };

        var analytics = await context.Service.GetAsync(3, null, CancellationToken.None);

        Assert.Equal(3, analytics.HourlyIngestion.Count);
        Assert.Equal(new[] { 2, 1, 1 }, analytics.HourlyIngestion.Select(item => item.Forwarded));
        Assert.Equal(new[] { 0, 1, 1 }, analytics.HourlyIngestion.Select(item => item.Blocked));
        Assert.Equal(
            new[]
            {
                new DateTimeOffset(2026, 10, 30, 10, 0, 0, TimeSpan.Zero),
                new DateTimeOffset(2026, 10, 30, 11, 0, 0, TimeSpan.Zero),
                new DateTimeOffset(2026, 10, 30, 12, 0, 0, TimeSpan.Zero)
            },
            analytics.HourlyIngestion.Select(item => item.Hour));
    }

    [Fact]
    public async Task GetAsync_FillsEmptyDistributionKeysWithZero()
    {
        var context = new Context();
        context.Administration.Analytics = EmptyData() with
        {
            AliasStatuses =
            [
                new AdminDistributionItem("active", 7),
                new AdminDistributionItem("deleted", 2)
            ],
            AuthenticationResults =
            [
                new AdminDistributionItem("PASS", 4),
                new AdminDistributionItem("fail", 1)
            ]
        };

        var analytics = await context.Service.GetAsync(null, null, CancellationToken.None);

        Assert.Equal(
            new[]
            {
                new AdminDistributionItem("active", 7),
                new AdminDistributionItem("disabled", 0),
                new AdminDistributionItem("replaced", 0),
                new AdminDistributionItem("deleted", 2)
            },
            analytics.AliasStatuses);
        Assert.Equal(
            new[]
            {
                new AdminDistributionItem("pass", 4),
                new AdminDistributionItem("none", 0),
                new AdminDistributionItem("fail", 1),
                new AdminDistributionItem("unknown", 0)
            },
            analytics.AuthenticationResults);
    }

    [Fact]
    public async Task GetAsync_OrdersBlockReasonsAndMapsTotalsAndAudit()
    {
        var auditTime = Now.AddMinutes(-5);
        var context = new Context();
        context.Administration.Analytics = EmptyData() with
        {
            RegisteredUsers = 12,
            PendingInviteRequests = 2,
            Aliases = 40,
            ActiveAliases = 31,
            ForwardedMessages = 9,
            BlockedMessages = 4,
            UnexpectedSenderMessages = 3,
            BlocklistedDomains = 1,
            KvDirtyAliases = 6,
            BlockedReasons =
            [
                new AdminBlockReason("spam", 2),
                new AdminBlockReason("phish", 5),
                new AdminBlockReason("abuse", 2)
            ],
            RecentAudit =
            [
                new Postern.Domain.Administration.AdminAuditLogEntry
                {
                    Id = Guid.NewGuid(),
                    AdminUserId = Guid.NewGuid(),
                    Action = "kv.sync",
                    TargetId = "target-1",
                    Metadata = "{\"aliasesSynced\":1}",
                    CreatedAt = auditTime
                }
            ]
        };

        var analytics = await context.Service.GetAsync(null, null, CancellationToken.None);

        Assert.Equal(
            new[]
            {
                new AdminBlockReason("phish", 5),
                new AdminBlockReason("abuse", 2),
                new AdminBlockReason("spam", 2)
            },
            analytics.BlockedReasons);
        Assert.Equal(
            new AdminAnalyticsTotals(12, 2, 40, 31, 9, 4, 3, 1, 6),
            analytics.Totals);
        var audit = Assert.Single(analytics.RecentAudit);
        Assert.Equal("kv.sync", audit.Action);
        Assert.Equal("target-1", audit.TargetId);
        Assert.Equal("{\"aliasesSynced\":1}", audit.Metadata);
        Assert.Equal(auditTime, audit.CreatedAt);
    }

    [Fact]
    public async Task GetAsync_PassesWindowAuditCutoffAndLimitToTheRepository()
    {
        var context = new Context();

        var analytics = await context.Service.GetAsync(48, 5, CancellationToken.None);

        Assert.Equal(Now, analytics.GeneratedAt);
        Assert.Equal(48, analytics.WindowHours);
        Assert.Equal(5, analytics.MinimumDomainVolume);
        Assert.Equal(Now.AddHours(-48), context.Administration.AnalyticsSince);
        Assert.Equal(Now.AddDays(-30), context.Administration.AnalyticsAuditSince);
        Assert.Equal(AdminAnalyticsService.RecentAuditLimit, context.Administration.AnalyticsRecentAuditLimit);
    }

    [Theory]
    [InlineData(null, AdminAnalyticsService.DefaultWindowHours)]
    [InlineData(0, AdminAnalyticsService.DefaultWindowHours)]
    [InlineData(-5, AdminAnalyticsService.DefaultWindowHours)]
    [InlineData(3, 3)]
    [InlineData(169, AdminAnalyticsService.MaximumWindowHours)]
    public void NormalizeWindowHours_ClampsToTheSupportedRange(int? input, int expected) =>
        Assert.Equal(expected, AdminAnalyticsService.NormalizeWindowHours(input));

    [Theory]
    [InlineData(null, AdminAnalyticsService.DefaultMinimumDomainVolume)]
    [InlineData(0, AdminAnalyticsService.DefaultMinimumDomainVolume)]
    [InlineData(-2, AdminAnalyticsService.DefaultMinimumDomainVolume)]
    [InlineData(7, 7)]
    [InlineData(101, AdminAnalyticsService.MaximumMinimumDomainVolume)]
    public void NormalizeMinimumDomainVolume_ClampsToTheSupportedRange(int? input, int expected) =>
        Assert.Equal(expected, AdminAnalyticsService.NormalizeMinimumDomainVolume(input));

    private static AdminAnalyticsData EmptyData() =>
        new(0, 0, 0, 0, 0, 0, 0, 0, 0, [], [], [], [], [], [], []);

    private sealed class Context
    {
        public Context()
        {
            Administration = new InMemoryAdministrationRepository();
            Service = new AdminAnalyticsService(Administration, new FixedTimeProvider(Now));
        }

        public InMemoryAdministrationRepository Administration { get; }

        public AdminAnalyticsService Service { get; }
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
