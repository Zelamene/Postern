using System.Text.Json;
using Postern.Application.Accounts;
using Postern.Application.Administration;
using Postern.Domain.Administration;
using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public class AdminKvSyncServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 30, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task SyncAsync_WritesDirtyAliasesClearsOnlySuccessfulOnesAndAudits()
    {
        var context = new Context();
        var adminId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var goodAlias = new AdminKvSyncAlias(
            Guid.NewGuid(),
            "Good@Example.test",
            userId,
            "destination@example.test",
            "active");
        var badAlias = new AdminKvSyncAlias(
            Guid.NewGuid(),
            "bad@example.test",
            userId,
            "destination@example.test",
            "disabled");
        context.Administration.DirtyAliases.Add(goodAlias);
        context.Administration.DirtyAliases.Add(badAlias);
        context.Administration.Seed(new GlobalBlockedDomain
        {
            DomainEtld1 = "spam.example",
            Reason = "abuse",
            CreatedAt = Now
        });
        context.Kv.FailingKeys.Add("bad@example.test");

        var result = await context.Service.SyncAsync(adminId, CancellationToken.None);

        Assert.Equal(1, result.AliasesSynced);
        Assert.Equal(1, result.AliasesFailed);
        Assert.Equal(1, result.RemainingDirtyAliases);
        Assert.True(result.GlobalBlocklistRebuilt);
        Assert.True(result.SuspendedUsersRebuilt);
        Assert.Equal(new[] { goodAlias.AliasId }, context.Administration.ClearedAliasIds);
        Assert.Equal(new[] { badAlias }, context.Administration.DirtyAliases);

        var payload = JsonDocument.Parse(context.Kv.Values["good@example.test"]).RootElement;
        Assert.Equal("destination@example.test", payload.GetProperty("destination").GetString());
        Assert.Equal("active", payload.GetProperty("status").GetString());
        Assert.Equal(userId.ToString(), payload.GetProperty("userId").GetString());
        Assert.Empty(payload.GetProperty("blockedSenders").EnumerateArray());

        var publishedDomains = JsonDocument.Parse(
                context.Kv.Values[GlobalBlocklistService.KvKey])
            .RootElement.GetProperty("domains")
            .EnumerateArray()
            .Select(item => item.GetString());
        Assert.Equal(new[] { "spam.example" }, publishedDomains);
        Assert.True(context.Kv.Values.ContainsKey(SuspendedUserService.KvKey));

        var audit = Assert.Single(context.Administration.AuditEntries);
        Assert.Equal("kv.sync", audit.Action);
        Assert.Equal(adminId, audit.AdminUserId);
        var metadata = JsonDocument.Parse(audit.Metadata!).RootElement;
        Assert.Equal(1, metadata.GetProperty("aliasesSynced").GetInt32());
        Assert.Equal(1, metadata.GetProperty("aliasesFailed").GetInt32());
        Assert.Equal(1, metadata.GetProperty("remainingDirtyAliases").GetInt32());
        Assert.True(metadata.GetProperty("globalBlocklistRebuilt").GetBoolean());
        Assert.True(metadata.GetProperty("suspendedUsersRebuilt").GetBoolean());
    }

    [Fact]
    public async Task SyncAsync_IsIdempotentForAlreadyCleanAliases()
    {
        var context = new Context();
        var alias = new AdminKvSyncAlias(
            Guid.NewGuid(),
            "once@example.test",
            Guid.NewGuid(),
            "destination@example.test",
            "active");
        context.Administration.DirtyAliases.Add(alias);

        var first = await context.Service.SyncAsync(null, CancellationToken.None);
        var second = await context.Service.SyncAsync(null, CancellationToken.None);

        Assert.Equal(1, first.AliasesSynced);
        Assert.Equal(0, first.RemainingDirtyAliases);
        Assert.Equal(0, second.AliasesSynced);
        Assert.Equal(0, second.AliasesFailed);
        Assert.Equal(0, second.RemainingDirtyAliases);
        Assert.True(context.Kv.Values.ContainsKey("once@example.test"));
        Assert.Equal(new[] { alias.AliasId }, context.Administration.ClearedAliasIds);
        Assert.Equal(2, context.Administration.AuditEntries.Count);
        Assert.All(context.Administration.AuditEntries, entry => Assert.Equal("kv.sync", entry.Action));
    }

    [Fact]
    public async Task SyncAsync_WhenEveryWriteFails_KeepsAliasesDirtyAndRecordsFailures()
    {
        var context = new Context();
        context.Administration.DirtyAliases.Add(new AdminKvSyncAlias(
            Guid.NewGuid(),
            "one@example.test",
            Guid.NewGuid(),
            "destination@example.test",
            "active"));
        context.Administration.DirtyAliases.Add(new AdminKvSyncAlias(
            Guid.NewGuid(),
            "two@example.test",
            Guid.NewGuid(),
            "destination@example.test",
            "active"));
        context.Kv.ShouldFail = true;

        var result = await context.Service.SyncAsync(Guid.NewGuid(), CancellationToken.None);

        Assert.Equal(0, result.AliasesSynced);
        Assert.Equal(2, result.AliasesFailed);
        Assert.Equal(2, result.RemainingDirtyAliases);
        Assert.False(result.GlobalBlocklistRebuilt);
        Assert.False(result.SuspendedUsersRebuilt);
        Assert.Empty(context.Administration.ClearedAliasIds);
        Assert.Equal(2, context.Administration.DirtyAliases.Count);
        var audit = Assert.Single(context.Administration.AuditEntries);
        var metadata = JsonDocument.Parse(audit.Metadata!).RootElement;
        Assert.Equal(0, metadata.GetProperty("aliasesSynced").GetInt32());
        Assert.Equal(2, metadata.GetProperty("aliasesFailed").GetInt32());
        Assert.False(metadata.GetProperty("globalBlocklistRebuilt").GetBoolean());
    }

    private sealed class Context
    {
        public Context()
        {
            Kv = new InMemoryKvWriter();
            Administration = new InMemoryAdministrationRepository();
            var accounts = new InMemoryAccountRepository { AutoCreateUsers = false };
            Service = new AdminKvSyncService(
                Administration,
                new GlobalBlocklistService(Administration, Kv),
                new SuspendedUserService(accounts, Kv),
                Kv,
                new FixedTimeProvider(Now));
        }

        public InMemoryKvWriter Kv { get; }

        public InMemoryAdministrationRepository Administration { get; }

        public AdminKvSyncService Service { get; }
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
