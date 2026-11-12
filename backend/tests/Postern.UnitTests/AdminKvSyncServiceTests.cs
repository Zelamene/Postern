using System.Text.Json;
using Postern.Application.Accounts;
using Postern.Application.Administration;
using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public class AdminKvSyncServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 30, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task SyncAsync_WritesMissingRecordsAndClearsConfirmedAliases()
    {
        var context = new Context();
        var adminId = Guid.NewGuid();
        var userId = Guid.NewGuid();
        var alias = new AdminKvSyncAlias(
            Guid.NewGuid(),
            "Good@Example.test",
            userId,
            "destination@example.test",
            "active",
            ["spam.example"]);
        context.Administration.Aliases.Add(alias);

        var result = await context.Service.SyncAsync(adminId, CancellationToken.None);

        Assert.Equal(1, result.AliasesSynced);
        Assert.Equal(0, result.AliasesFailed);
        Assert.Equal(0, result.AliasesDeleted);
        Assert.Equal(0, result.RemainingDirtyAliases);
        Assert.True(result.GlobalBlocklistRebuilt);
        Assert.True(result.SuspendedUsersRebuilt);
        Assert.Equal(new[] { alias.AliasId }, context.Administration.ClearedAliasIds);

        var payload = JsonDocument.Parse(context.Kv.Values["good@example.test"]).RootElement;
        Assert.Equal("destination@example.test", payload.GetProperty("destination").GetString());
        Assert.Equal("active", payload.GetProperty("status").GetString());
        Assert.Equal(userId.ToString(), payload.GetProperty("userId").GetString());
        Assert.Equal(
            new[] { "spam.example" },
            payload.GetProperty("blockedSenders").EnumerateArray().Select(item => item.GetString()));
        Assert.True(context.Kv.Values.ContainsKey(SuspendedUserService.KvKey));
        Assert.True(context.Kv.Values.ContainsKey(GlobalBlocklistService.KvKey));

        var audit = Assert.Single(context.Administration.AuditEntries);
        Assert.Equal("kv.sync", audit.Action);
        Assert.Equal(adminId, audit.AdminUserId);
        var metadata = JsonDocument.Parse(audit.Metadata!).RootElement;
        Assert.Equal(1, metadata.GetProperty("aliasesSynced").GetInt32());
        Assert.Equal(0, metadata.GetProperty("aliasesDeleted").GetInt32());
        Assert.Equal(0, metadata.GetProperty("aliasesFailed").GetInt32());
    }

    [Fact]
    public async Task SyncAsync_DeletesKeysThatNoLongerBelongToAnyAlias()
    {
        var context = new Context();
        await context.Kv.PutAsync("stale@example.test", "{}", CancellationToken.None);
        await context.Kv.PutAsync("kept@example.test", "{}", CancellationToken.None);
        context.Administration.Aliases.Add(new AdminKvSyncAlias(
            Guid.NewGuid(),
            "kept@example.test",
            Guid.NewGuid(),
            "destination@example.test",
            "active",
            []));

        var result = await context.Service.SyncAsync(null, CancellationToken.None);

        Assert.Equal(1, result.AliasesDeleted);
        Assert.False(context.Kv.Values.ContainsKey("stale@example.test"));
        Assert.True(context.Kv.Values.ContainsKey("kept@example.test"));
    }

    [Fact]
    public async Task SyncAsync_KeepsReservedGlobalKeys()
    {
        var context = new Context();
        await context.Kv.PutAsync(RateLimitServiceKvKey, "{}", CancellationToken.None);

        var result = await context.Service.SyncAsync(null, CancellationToken.None);

        Assert.Equal(0, result.AliasesDeleted);
        Assert.True(context.Kv.Values.ContainsKey(RateLimitServiceKvKey));
    }

    [Fact]
    public async Task SyncAsync_IsIdempotentForUnchangedRecords()
    {
        var context = new Context();
        var alias = new AdminKvSyncAlias(
            Guid.NewGuid(),
            "once@example.test",
            Guid.NewGuid(),
            "destination@example.test",
            "active",
            []);
        context.Administration.Aliases.Add(alias);

        var first = await context.Service.SyncAsync(null, CancellationToken.None);
        var putsAfterFirst = context.Kv.Puts;
        var second = await context.Service.SyncAsync(null, CancellationToken.None);

        Assert.Equal(1, first.AliasesSynced);
        Assert.Equal(0, second.AliasesSynced);
        Assert.Equal(0, second.AliasesFailed);
        Assert.Equal(putsAfterFirst + 2, context.Kv.Puts);
        Assert.Equal(2, context.Administration.AuditEntries.Count);
    }

    [Fact]
    public async Task SyncAsync_WhenAliasWritesFail_KeepsThemDirtyAndReportsFailures()
    {
        var context = new Context();
        context.Administration.Aliases.Add(new AdminKvSyncAlias(
            Guid.NewGuid(),
            "one@example.test",
            Guid.NewGuid(),
            "destination@example.test",
            "active",
            []));
        context.Administration.Aliases.Add(new AdminKvSyncAlias(
            Guid.NewGuid(),
            "two@example.test",
            Guid.NewGuid(),
            "destination@example.test",
            "active",
            []));
        context.Kv.FailingKeys.Add("one@example.test");
        context.Kv.FailingKeys.Add("two@example.test");

        var result = await context.Service.SyncAsync(Guid.NewGuid(), CancellationToken.None);

        Assert.Equal(0, result.AliasesSynced);
        Assert.Equal(2, result.AliasesFailed);
        Assert.Equal(2, result.RemainingDirtyAliases);
        Assert.True(result.GlobalBlocklistRebuilt);
        Assert.Empty(context.Administration.ClearedAliasIds);
        Assert.Equal(2, context.Aliases.KvDirtyAliasIds.Count);
        var audit = Assert.Single(context.Administration.AuditEntries);
        var metadata = JsonDocument.Parse(audit.Metadata!).RootElement;
        Assert.Equal(0, metadata.GetProperty("aliasesSynced").GetInt32());
        Assert.Equal(2, metadata.GetProperty("aliasesFailed").GetInt32());
    }

    private const string RateLimitServiceKvKey = "rate_limited_users";

    private sealed class Context
    {
        public Context()
        {
            Kv = new InMemoryKvWriter();
            Aliases = new InMemoryAliasRepository();
            Administration = new InMemoryAdministrationRepository(Aliases);
            var accounts = new InMemoryAccountRepository { AutoCreateUsers = false };
            Service = new AdminKvSyncService(
                Administration,
                Aliases,
                new GlobalBlocklistService(Administration, Kv),
                new SuspendedUserService(accounts, Kv),
                Kv,
                new FixedTimeProvider(Now));
        }

        public InMemoryKvWriter Kv { get; }

        public InMemoryAliasRepository Aliases { get; }

        public InMemoryAdministrationRepository Administration { get; }

        public AdminKvSyncService Service { get; }
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
