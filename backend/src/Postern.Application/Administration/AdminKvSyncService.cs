using System.Text.Json;
using Postern.Application.Accounts;
using Postern.Application.Integrations;
using Postern.Domain.Administration;

namespace Postern.Application.Administration;

public sealed record AdminKvSyncResult(
    int AliasesSynced,
    int AliasesFailed,
    int RemainingDirtyAliases,
    bool GlobalBlocklistRebuilt,
    bool SuspendedUsersRebuilt);

public sealed class AdminKvSyncService(
    IAdministrationRepository administration,
    GlobalBlocklistService globalBlocklist,
    SuspendedUserService suspendedUsers,
    IKvWriter kvWriter,
    TimeProvider timeProvider)
{
    public const int BatchSize = 250;

    public async Task<AdminKvSyncResult> SyncAsync(
        Guid? adminUserId,
        CancellationToken cancellationToken)
    {
        var aliases = await administration.ListDirtyAliasesAsync(BatchSize, cancellationToken);
        var syncedAliasIds = new List<Guid>(aliases.Count);
        var failed = 0;

        foreach (var alias in aliases)
        {
            try
            {
                await kvWriter.PutAsync(
                    alias.FullAddress.ToLowerInvariant(),
                    AliasKvRecord.Serialize(alias.Destination, alias.Status, alias.UserId),
                    cancellationToken);
                syncedAliasIds.Add(alias.AliasId);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch
            {
                failed += 1;
            }
        }

        await administration.ClearKvDirtyAsync(syncedAliasIds, cancellationToken);
        var globalBlocklistRebuilt = await TryRebuildAsync(
            token => globalBlocklist.RebuildAsync(token),
            cancellationToken);
        var suspendedUsersRebuilt = await TryRebuildAsync(
            token => suspendedUsers.RebuildAsync(token),
            cancellationToken);
        var remaining = await administration.CountDirtyAliasesAsync(cancellationToken);

        await administration.RecordAuditEntryAsync(
            new AdminAuditLogEntry
            {
                Id = Guid.NewGuid(),
                AdminUserId = adminUserId,
                Action = "kv.sync",
                TargetId = null,
                Metadata = JsonSerializer.Serialize(new
                {
                    aliasesSynced = syncedAliasIds.Count,
                    aliasesFailed = failed,
                    remainingDirtyAliases = remaining,
                    globalBlocklistRebuilt,
                    suspendedUsersRebuilt
                }),
                CreatedAt = timeProvider.GetUtcNow()
            },
            cancellationToken);

        return new AdminKvSyncResult(
            syncedAliasIds.Count,
            failed,
            remaining,
            globalBlocklistRebuilt,
            suspendedUsersRebuilt);
    }

    private static async Task<bool> TryRebuildAsync(
        Func<CancellationToken, Task> rebuild,
        CancellationToken cancellationToken)
    {
        try
        {
            await rebuild(cancellationToken);
            return true;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch
        {
            return false;
        }
    }
}
