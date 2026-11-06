using System.Net;
using System.Net.Http.Json;
using Postern.Domain.Aliases;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Modules;

[Collection(IntegrationCollection.Name)]
public sealed class AdminAnalyticsEndpointsTests(PosternFixture fixture) : IAsyncLifetime
{
    private PosternApiFactory _factory = null!;

    public Task InitializeAsync()
    {
        _factory = new PosternApiFactory(fixture);
        return Task.CompletedTask;
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task Analytics_RequiresAuthentication()
    {
        using var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/admin/analytics");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Analytics_RequiresAdminRole()
    {
        var user = await fixture.AUserAsync();
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.GetAsync("/api/admin/analytics");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task Analytics_ReturnsAggregatesAndHidesLowVolumeSenderDomains()
    {
        var admin = await fixture.AUserAsync(isAdmin: true);
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id, status: AliasStatus.Active);
        var token = Guid.NewGuid().ToString("N")[..12];
        var highDomain = $"high-{token}.example";
        var lowDomain = $"low-{token}.example";

        for (var index = 0; index < 3; index++)
        {
            await fixture.AMessageAsync(
                alias.Id,
                isFlagged: true,
                fromHeader: $"Shop <orders@{highDomain}>",
                envelopeSender: $"orders@{highDomain}");
        }

        await fixture.AMessageAsync(
            alias.Id,
            isFlagged: true,
            fromHeader: $"Shop <orders@{lowDomain}>",
            envelopeSender: $"orders@{lowDomain}");
        await fixture.ABlockedMessageAsync(
            alias.Id,
            reason: "unexpected_sender",
            fromHeader: $"Bad <security@{highDomain}>");
        await fixture.AnAuditEntryAsync(
            "test.analytics",
            targetId: alias.Id.ToString(),
            metadata: "{\"safe\":true}");

        using var client = _factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);

        var response = await client.GetAsync("/api/admin/analytics?windowHours=168&minimumDomainVolume=3");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<AnalyticsBody>();
        Assert.NotNull(body);
        Assert.Equal(168, body.WindowHours);
        Assert.Equal(3, body.MinimumDomainVolume);
        Assert.Equal(168, body.HourlyIngestion.Count);
        Assert.Contains(body.SenderDomains, domain => domain.Domain == highDomain && domain.Count == 4);
        Assert.DoesNotContain(body.SenderDomains, domain => domain.Domain == lowDomain);
        Assert.True(body.HiddenSenderDomains >= 1);
        Assert.Contains(body.AliasStatuses, item => item.Key == "active" && item.Count >= 1);
        Assert.Contains(body.AuthenticationResults, item => item.Key == "pass" && item.Count >= 4);
        Assert.Contains(body.BlockedReasons, item => item.Reason == "unexpected_sender" && item.Count >= 1);
        Assert.Contains(
            body.RecentAudit,
            entry => entry.Action == "test.analytics" && entry.TargetId == alias.Id.ToString());
        Assert.True(body.Totals.Aliases >= 1);
        Assert.True(body.Totals.ActiveAliases >= 1);
        Assert.True(body.Totals.ForwardedMessages >= 4);
        Assert.True(body.Totals.BlockedMessages >= 1);
        Assert.True(body.Totals.UnexpectedSenderMessages >= 4);
    }

    [Fact]
    public async Task Analytics_DoesNotExposeSubjectsBodiesOrUserEmails()
    {
        var admin = await fixture.AUserAsync(isAdmin: true);
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        const string subject = "private invoice for a specific person";
        await fixture.AMessageAsync(alias.Id, subject: subject, isFlagged: true);

        using var client = _factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);

        var response = await client.GetAsync("/api/admin/analytics");
        var raw = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.DoesNotContain(subject, raw, StringComparison.Ordinal);
        Assert.DoesNotContain(user.Email, raw, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(alias.FullAddress!, raw, StringComparison.OrdinalIgnoreCase);
    }

    private sealed record AnalyticsBody(
        int WindowHours,
        int MinimumDomainVolume,
        AnalyticsTotals Totals,
        IReadOnlyList<HourlyIngestion> HourlyIngestion,
        IReadOnlyList<DistributionItem> AliasStatuses,
        IReadOnlyList<DistributionItem> AuthenticationResults,
        IReadOnlyList<SenderDomain> SenderDomains,
        int HiddenSenderDomains,
        IReadOnlyList<BlockReason> BlockedReasons,
        IReadOnlyList<AuditEntry> RecentAudit);

    private sealed record AnalyticsTotals(
        int RegisteredUsers,
        int PendingInviteRequests,
        int Aliases,
        int ActiveAliases,
        int ForwardedMessages,
        int BlockedMessages,
        int UnexpectedSenderMessages,
        int BlocklistedDomains,
        int KvDirtyAliases);

    private sealed record HourlyIngestion(DateTimeOffset Hour, int Forwarded, int Blocked);

    private sealed record DistributionItem(string Key, int Count);

    private sealed record SenderDomain(string Domain, int Count);

    private sealed record BlockReason(string Reason, int Count);

    private sealed record AuditEntry(
        Guid Id,
        string Action,
        string? TargetId,
        string? Metadata,
        DateTimeOffset CreatedAt);
}
