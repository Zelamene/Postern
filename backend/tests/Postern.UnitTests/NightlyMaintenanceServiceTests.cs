using System.Text.Json;
using Postern.Application.Accounts;
using Postern.Application.Administration;
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
        context.Administration.DirtyAliases.Add(new AdminKvSyncAlias(
            Guid.NewGuid(),
            "nightly@example.test",
            Guid.NewGuid(),
            "destination@example.test",
            "active"));

        var result = await context.Service.RunAsync(CancellationToken.None);

        Assert.Equal(Now, result.StartedAt);
        Assert.Equal(Now, result.CompletedAt);
        Assert.Equal(5, result.DeletedMessages);
        Assert.Equal(2, result.DeletedBlockedMessages);
        Assert.Equal(4, result.DeletedWebhookEvents);
        Assert.Equal(1, result.DeletedInviteRequests);
        Assert.Equal(1, result.KvSync.AliasesSynced);
        Assert.Equal(0, result.KvSync.RemainingDirtyAliases);

        Assert.Equal(Now - NightlyMaintenanceService.ActivityRetention, context.Administration.MessagesCutoff);
        Assert.Equal(Now - NightlyMaintenanceService.ActivityRetention, context.Administration.BlockedMessagesCutoff);
        Assert.Equal(Now - NightlyMaintenanceService.WebhookRetention, context.Administration.WebhookEventsCutoff);
        Assert.Equal(Now - NightlyMaintenanceService.InviteRequestRetention, context.Administration.InviteRequestsCutoff);

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
        Assert.Equal(1, metadata.GetProperty("aliasesSynced").GetInt32());
        Assert.Equal(0, metadata.GetProperty("aliasesFailed").GetInt32());
        Assert.Equal(0, metadata.GetProperty("remainingDirtyAliases").GetInt32());
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
            Administration = new InMemoryAdministrationRepository();
            var accounts = new InMemoryAccountRepository { AutoCreateUsers = false };
            var timeProvider = new FixedTimeProvider(Now);
            var kvSync = new AdminKvSyncService(
                Administration,
                new GlobalBlocklistService(Administration, Kv),
                new SuspendedUserService(accounts, Kv),
                Kv,
                timeProvider);
            Service = new NightlyMaintenanceService(Administration, kvSync, timeProvider);
        }

        public InMemoryKvWriter Kv { get; }

        public InMemoryAdministrationRepository Administration { get; }

        public NightlyMaintenanceService Service { get; }
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
