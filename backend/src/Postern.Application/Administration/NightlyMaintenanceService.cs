using System.Text.Json;
using Postern.Domain.Administration;

namespace Postern.Application.Administration;

public sealed record NightlyJobResult(
    DateTimeOffset StartedAt,
    DateTimeOffset CompletedAt,
    int DeletedMessages,
    int DeletedBlockedMessages,
    int DeletedWebhookEvents,
    int DeletedInviteRequests,
    AdminKvSyncResult KvSync);

public sealed class NightlyMaintenanceService(
    IAdministrationRepository administration,
    AdminKvSyncService kvSync,
    TimeProvider timeProvider)
{
    public static readonly TimeSpan ActivityRetention = TimeSpan.FromDays(90);
    public static readonly TimeSpan WebhookRetention = TimeSpan.FromDays(30);
    public static readonly TimeSpan InviteRequestRetention = TimeSpan.FromDays(30);

    public async Task<NightlyJobResult> RunAsync(CancellationToken cancellationToken)
    {
        var startedAt = timeProvider.GetUtcNow();
        var deletedMessages = await administration.DeleteMessagesBeforeAsync(
            startedAt - ActivityRetention,
            cancellationToken);
        var deletedBlockedMessages = await administration.DeleteBlockedMessagesBeforeAsync(
            startedAt - ActivityRetention,
            cancellationToken);
        var deletedWebhookEvents = await administration.DeleteWebhookEventsBeforeAsync(
            startedAt - WebhookRetention,
            cancellationToken);
        var deletedInviteRequests = await administration.DeletePendingInviteRequestsBeforeAsync(
            startedAt - InviteRequestRetention,
            cancellationToken);
        var kvSyncResult = await kvSync.SyncAsync(null, cancellationToken);
        var completedAt = timeProvider.GetUtcNow();

        await administration.RecordAuditEntryAsync(
            new AdminAuditLogEntry
            {
                Id = Guid.NewGuid(),
                AdminUserId = null,
                Action = "job.nightly",
                TargetId = null,
                Metadata = JsonSerializer.Serialize(new
                {
                    deletedMessages,
                    deletedBlockedMessages,
                    deletedWebhookEvents,
                    deletedInviteRequests,
                    aliasesSynced = kvSyncResult.AliasesSynced,
                    aliasesFailed = kvSyncResult.AliasesFailed,
                    remainingDirtyAliases = kvSyncResult.RemainingDirtyAliases
                }),
                CreatedAt = completedAt
            },
            cancellationToken);

        return new NightlyJobResult(
            startedAt,
            completedAt,
            deletedMessages,
            deletedBlockedMessages,
            deletedWebhookEvents,
            deletedInviteRequests,
            kvSyncResult);
    }
}
