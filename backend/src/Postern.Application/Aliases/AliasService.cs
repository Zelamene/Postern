using System.Security.Cryptography;
using System.Text;
using Postern.Application.Integrations;
using Postern.Domain.Aliases;

namespace Postern.Application.Aliases;

public sealed class AliasService(
    IAliasRepository aliases,
    TimeProvider timeProvider,
    IKvWriter kvWriter)
{
    public async Task<Alias?> CreateAsync(
        Guid userId,
        string label,
        string purposeMetadata,
        CancellationToken cancellationToken)
    {
        var safeLabel = string.IsNullOrWhiteSpace(label) ? "default" : label.Trim();
        if (safeLabel.Length > 64)
        {
            safeLabel = safeLabel[..64];
        }

        if (ReservedAliases.IsReserved(safeLabel))
        {
            return null;
        }

        var suffix = Guid.NewGuid().ToString("N")[..8];
        var address = $"{safeLabel}-{suffix}@postern.local";
        var now = timeProvider.GetUtcNow();

        var alias = new Alias
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Label = safeLabel,
            RandomSuffix = suffix,
            FullAddress = address,
            FullAddressHash = HashAddress(address),
            PurposeMetadata = string.IsNullOrWhiteSpace(purposeMetadata) ? null : purposeMetadata,
            Category = "personal",
            Status = AliasStatus.Active,
            CreatedAt = now,
            KvDirty = false
        };

        var created = await aliases.CreateAsync(alias, cancellationToken);

        var kvValue = System.Text.Json.JsonSerializer.Serialize(new
        {
            destination = string.Empty,
            status = "active",
            userId = userId.ToString(),
            blockedSenders = Array.Empty<string>()
        });

        try
        {
            await kvWriter.PutAsync(address.ToLowerInvariant(), kvValue, cancellationToken);
        }
        catch
        {
            await aliases.MarkKvDirtyAsync(created.Id, cancellationToken);
        }

        return created;
    }

    public async Task<IReadOnlyCollection<Alias>> ListAsync(
        Guid userId,
        CancellationToken cancellationToken) =>
        await aliases.ListByUserAsync(userId, cancellationToken);

    public async Task<bool> DisableAsync(
        Guid userId,
        Guid aliasId,
        CancellationToken cancellationToken)
    {
        var success = await aliases.UpdateStatusAsync(aliasId, userId, AliasStatus.Disabled, timeProvider.GetUtcNow(), cancellationToken);
        if (success)
        {
            var alias = await aliases.GetOwnedAliasAsync(aliasId, userId, cancellationToken);
            if (alias?.FullAddress is not null)
            {
                var kvValue = System.Text.Json.JsonSerializer.Serialize(new
                {
                    destination = string.Empty,
                    status = "disabled",
                    userId = userId.ToString(),
                    blockedSenders = Array.Empty<string>()
                });
                try
                {
                    await kvWriter.PutAsync(alias.FullAddress.ToLowerInvariant(), kvValue, cancellationToken);
                }
                catch
                {
                    await aliases.MarkKvDirtyAsync(aliasId, cancellationToken);
                }
            }
        }

        return success;
    }

    public async Task<bool> DeleteAsync(
        Guid userId,
        Guid aliasId,
        CancellationToken cancellationToken)
    {
        var alias = await aliases.GetOwnedAliasAsync(aliasId, userId, cancellationToken);
        var address = alias?.FullAddress;
        var success = await aliases.DeleteAsync(aliasId, userId, timeProvider.GetUtcNow(), cancellationToken);
        if (success && address is not null)
        {
            try
            {
                await kvWriter.DeleteAsync(address.ToLowerInvariant(), cancellationToken);
            }
            catch
            {
                // Tombstone is preserved in DB regardless of KV failure
            }
        }

        return success;
    }

    public async Task<bool> ReplaceAsync(
        Guid userId,
        Guid aliasId,
        Guid replacementAliasId,
        CancellationToken cancellationToken)
    {
        var success = await aliases.MarkReplacedAsync(aliasId, userId, replacementAliasId, timeProvider.GetUtcNow(), cancellationToken);
        if (success)
        {
            var alias = await aliases.GetOwnedAliasAsync(aliasId, userId, cancellationToken);
            if (alias?.FullAddress is not null)
            {
                var kvValue = System.Text.Json.JsonSerializer.Serialize(new
                {
                    destination = string.Empty,
                    status = "replaced",
                    userId = userId.ToString(),
                    blockedSenders = Array.Empty<string>()
                });
                try
                {
                    await kvWriter.PutAsync(alias.FullAddress.ToLowerInvariant(), kvValue, cancellationToken);
                }
                catch
                {
                    await aliases.MarkKvDirtyAsync(aliasId, cancellationToken);
                }
            }
        }

        return success;
    }

    public async Task<bool> IsAddressHashTombstonedAsync(
        string address,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(address))
        {
            return false;
        }

        var hash = HashAddress(address.Trim().ToLowerInvariant());
        return await aliases.IsAddressHashTombstonedAsync(hash, cancellationToken);
    }

    public async Task<IReadOnlyCollection<ExpectedSender>> ListExpectedSendersAsync(
        Guid userId,
        Guid aliasId,
        CancellationToken cancellationToken) =>
        await aliases.ListExpectedSendersAsync(aliasId, userId, cancellationToken);

    public async Task<ExpectedSender?> AddExpectedSenderAsync(
        Guid userId,
        Guid aliasId,
        string senderEtld1,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(senderEtld1))
        {
            return null;
        }

        var normalized = Etld1Normalizer.Normalize(senderEtld1);
        if (string.IsNullOrWhiteSpace(normalized) || normalized.Length > 253)
        {
            return null;
        }

        return await aliases.AddExpectedSenderAsync(
            aliasId,
            userId,
            normalized,
            timeProvider.GetUtcNow(),
            cancellationToken);
    }

    public async Task<bool> MarkExpectedSenderAsync(
        Guid userId,
        Guid aliasId,
        string senderEtld1,
        CancellationToken cancellationToken)
    {
        var sender = await AddExpectedSenderAsync(userId, aliasId, senderEtld1, cancellationToken);
        return sender is not null;
    }

    public async Task<bool> BlockSenderAsync(
        Guid userId,
        Guid aliasId,
        string senderEtld1,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(senderEtld1))
        {
            return false;
        }

        var normalized = Etld1Normalizer.Normalize(senderEtld1);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return false;
        }

        return await aliases.BlockSenderAsync(aliasId, userId, normalized, cancellationToken);
    }

    public static string HashAddress(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
}
