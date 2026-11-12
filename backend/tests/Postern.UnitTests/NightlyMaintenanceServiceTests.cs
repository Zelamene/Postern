using System.Text.Json;
using Postern.Application.Accounts;
using Postern.Application.Administration;
using Postern.Domain.Accounts;
using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public class NightlyMaintenanceServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 30, 3, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task RunAsync_AppliesRetentionWindowsSyncsKvAndAuditsTheRun()
    {
        var context = new Context();
        context.Administration.DeletedMessages = 5;
        context.Administration.DeletedBlockedMessages = 2;
        context.Administration.DeletedWebhookEvents = 4;
        context.Administration.DeletedInviteRequests = 1;
        context.Administration.Aliases.Add(new AdminKvSyncAlias(
            Guid.NewGuid(),
            "nightly@example.test",
            Guid.NewGuid(),
            "destination@example.test",
            "active",
            []));

        var result = await context.Service.RunAsync(CancellationToken.None);

        Assert.Equal(Now, result.StartedAt);
        Assert.Equal(Now, result.CompletedAt);
        Assert.Equal(5, result.DeletedMessages);
        Assert.Equal(2, result.DeletedBlockedMessages);
        Assert.Equal(4, result.DeletedWebhookEvents);
        Assert.Equal(1, result.DeletedInviteRequests);
        Assert.Equal(0, result.DeletedPendingUsers);
        Assert.Equal(1, result.KvSync.AliasesSynced);
        Assert.Equal(0, result.KvSync.RemainingDirtyAliases);

        Assert.Equal(Now - NightlyMaintenanceService.ActivityRetention, context.Administration.MessagesCutoff);
        Assert.Equal(Now - NightlyMaintenanceService.ActivityRetention, context.Administration.BlockedMessagesCutoff);
        Assert.Equal(Now - NightlyMaintenanceService.WebhookRetention, context.Administration.WebhookEventsCutoff);
        Assert.Equal(Now - NightlyMaintenanceService.InviteRequestRetention, context.Administration.InviteRequestsCutoff);
        Assert.Equal(Now - NightlyMaintenanceService.PendingUserRetention, context.Administration.StalePendingUsersCutoff);

        Assert.Equal(2, context.Administration.AuditEntries.Count);
        Assert.Equal("kv.sync", context.Administration.AuditEntries[0].Action);
        var jobAudit = context.Administration.AuditEntries[^1];
        Assert.Equal("job.nightly", jobAudit.Action);
        Assert.Null(jobAudit.AdminUserId);
        Assert.Equal(Now, jobAudit.CreatedAt);
        var metadata = JsonDocument.Parse(jobAudit.Metadata!).RootElement;
        Assert.Equal(5, metadata.GetProperty("deletedMessages").GetInt32());
        Assert.Equal(2, metadata.GetProperty("deletedBlockedMessages").GetInt32());
        Assert.Equal(4, metadata.GetProperty("deletedWebhookEvents").GetInt32());
        Assert.Equal(1, metadata.GetProperty("deletedInviteRequests").GetInt32());
        Assert.Equal(0, metadata.GetProperty("deletedPendingUsers").GetInt32());
        Assert.Equal(1, metadata.GetProperty("aliasesSynced").GetInt32());
        Assert.Equal(0, metadata.GetProperty("aliasesFailed").GetInt32());
    }

    [Fact]
    public async Task RunAsync_RemovesDestinationsForStalePendingUsers()
    {
        var context = new Context();
        var staleUserId = Guid.NewGuid();
        context.Administration.StalePendingUsers.Add(new StalePendingUser(
            staleUserId,
            "pending@example.test",
            "pending@example.test"));

        var result = await context.Service.RunAsync(CancellationToken.None);

        Assert.Equal(1, result.DeletedPendingUsers);
        Assert.Equal([staleUserId], context.Administration.DeletedPendingUserIds);
        Assert.Equal(["pending@example.test"], context.Destinations.Removed);
    }

    [Fact]
    public async Task RunAsync_KeepsDestinationsThatAnotherUserShares()
    {
        var context = new Context();
        var staleUserId = Guid.NewGuid();
        var sharedAddress = "shared@example.test";
        context.Administration.StalePendingUsers.Add(new StalePendingUser(
            staleUserId,
            "pending@example.test",
            sharedAddress));
        var otherUserId = Guid.NewGuid();
        context.Accounts.Add(new PosternUser
        {
            Id = otherUserId,
            Email = "other@example.test",
            NormalizedEmail = "OTHER@EXAMPLE.TEST",
            ForwardingAddress = sharedAddress,
            PasswordHash = "hash",
            Status = "active",
            CreatedAt = Now
        });

        var result = await context.Service.RunAsync(CancellationToken.None);

        Assert.Equal(1, result.DeletedPendingUsers);
        Assert.Empty(context.Destinations.Removed);
    }

    [Fact]
    public async Task RunAsync_SkipsPendingUsersWhenTheDestinationCannotBeRemoved()
    {
        var context = new Context();
        context.Destinations.ShouldFail = true;
        context.Administration.StalePendingUsers.Add(new StalePendingUser(
            Guid.NewGuid(),
            "pending@example.test",
            "pending@example.test"));

        var result = await context.Service.RunAsync(CancellationToken.None);

        Assert.Equal(1, result.DeletedPendingUsers);
    }

    [Fact]
    public async Task RunAsync_WithoutDirtyAliasesStillRecordsTheMaintenanceAudit()
    {
        var context = new Context();

        var result = await context.Service.RunAsync(CancellationToken.None);

        Assert.Equal(0, result.DeletedMessages);
        Assert.Equal(0, result.KvSync.AliasesSynced);
        Assert.Equal("job.nightly", context.Administration.AuditEntries[^1].Action);
        Assert.Equal(2, context.Administration.AuditEntries.Count);
    }

    private sealed class Context
    {
        public Context()
        {
            Kv = new InMemoryKvWriter();
            Aliases = new InMemoryAliasRepository();
            Accounts = new InMemoryAccountRepository { AutoCreateUsers = false };
            Destinations = new InMemoryDestinationService();
            Administration = new InMemoryAdministrationRepository(Aliases);
            var timeProvider = new FixedTimeProvider(Now);
            var kvSync = new AdminKvSyncService(
                Administration,
                Aliases,
                new GlobalBlocklistService(Administration, Kv),
                new SuspendedUserService(Accounts, Kv),
                Kv,
                timeProvider);
            Service = new NightlyMaintenanceService(
                Administration,
                Accounts,
                Destinations,
                kvSync,
                timeProvider);
        }

        public InMemoryKvWriter Kv { get; }

        public InMemoryAliasRepository Aliases { get; }

        public InMemoryAccountRepository Accounts { get; }

        public InMemoryDestinationService Destinations { get; }

        public InMemoryAdministrationRepository Administration { get; }

        public NightlyMaintenanceService Service { get; }
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
