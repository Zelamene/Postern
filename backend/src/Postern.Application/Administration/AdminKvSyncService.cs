using System.Text.Json;
using Postern.Application.Accounts;
using Postern.Application.Activity;
using Postern.Application.Aliases;
using Postern.Application.Integrations;
using Postern.Domain.Administration;

namespace Postern.Application.Administration;

public sealed record AdminKvSyncResult(
    int AliasesSynced,
    int AliasesFailed,
    int AliasesDeleted,
    int RemainingDirtyAliases,
    bool GlobalBlocklistRebuilt,
    bool SuspendedUsersRebuilt,
    bool FullSync);

public sealed class AdminKvSyncService(
    IAdministrationRepository administration,
    IAliasRepository aliases,
    GlobalBlocklistService globalBlocklist,
    SuspendedUserService suspendedUsers,
    IKvWriter kvWriter,
    TimeProvider timeProvider)
{

    public async Task<AdminKvSyncResult> SyncAsync(
        Guid? adminUserId,
        CancellationToken cancellationToken,
        bool fullSync = true)
    {
        var desired = await administration.ListAliasesForKvAsync(
            onlyDirty: !fullSync,
            cancellationToken);
        var desiredByKey = desired.ToDictionary(
            alias => alias.FullAddress.ToLowerInvariant(),
            StringComparer.Ordinal);
        var existingKeys = fullSync
            ? await kvWriter.ListKeysAsync(cancellationToken)
            : Array.Empty<string>();

        var confirmedAliasIds = new List<Guid>(desired.Count);
        var synced = 0;
        var deleted = 0;
        var failed = 0;

        foreach (var alias in desired)
        {
            var key = alias.FullAddress.ToLowerInvariant();
            var payload = AliasKvRecord.Serialize(
                alias.Destination,
                alias.Status,
                alias.UserId,
                alias.BlockedSenders);

            try
            {
                var current = await kvWriter.GetAsync(key, cancellationToken);
                if (!string.Equals(current, payload, StringComparison.Ordinal))
                {
                    await kvWriter.PutAsync(key, payload, cancellationToken);
                    synced += 1;
                }

                confirmedAliasIds.Add(alias.AliasId);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch
            {
                failed += 1;
                await aliases.MarkKvDirtyAsync(alias.AliasId, cancellationToken);
            }
        }

        if (fullSync)
        {
            var reserved = new HashSet<string>(StringComparer.Ordinal)
            {
                GlobalBlocklistService.KvKey,
                SuspendedUserService.KvKey,
                RateLimitService.KvKey
            };

            foreach (var key in existingKeys)
            {
                if (desiredByKey.ContainsKey(key) || reserved.Contains(key))
                {
                    continue;
                }

                try
                {
                    await kvWriter.DeleteAsync(key, cancellationToken);
                    deleted += 1;
                }
                catch
                {
                    failed += 1;
                }
            }
        }

        await administration.ClearKvDirtyAsync(confirmedAliasIds, cancellationToken);

        var globalBlocklistRebuilt = await TryRebuildAsync(
            token => globalBlocklist.RebuildAsync(token),
            cancellationToken);
        var suspendedUsersRebuilt = await TryRebuildAsync(
            async token => await suspendedUsers.RebuildAsync(token),
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
                    aliasesSynced = synced,
                    aliasesDeleted = deleted,
                    aliasesFailed = failed,
                    remainingDirtyAliases = remaining,
                    globalBlocklistRebuilt,
                    suspendedUsersRebuilt,
                    fullSync
                }),
                CreatedAt = timeProvider.GetUtcNow()
            },
            cancellationToken);

        return new AdminKvSyncResult(
            synced,
            failed,
            deleted,
            remaining,
            globalBlocklistRebuilt,
            suspendedUsersRebuilt,
            fullSync);
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
