using System.Security.Cryptography;
using System.Text;
using Postern.Application.Accounts;
using Postern.Application.Integrations;
using Postern.Domain.Aliases;

namespace Postern.Application.Aliases;

public sealed class AliasService(
    IAliasRepository aliases,
    IAccountRepository accounts,
    TimeProvider timeProvider,
    IKvWriter kvWriter,
    AliasPolicy policy)
{
    private const int AddressAttempts = 5;
    private const int CategoryMaxLength = 40;
    private const string DefaultCategory = "personal";

    public async Task<Alias?> CreateAsync(
        Guid userId,
        string label,
        string purposeMetadata,
        CancellationToken cancellationToken,
        string? category = null)
    {
        var user = await accounts.FindByIdAsync(userId, cancellationToken);
        if (user is null)
        {
            return null;
        }

        var safeLabel = string.IsNullOrWhiteSpace(label) ? "default" : label.Trim();
        if (safeLabel.Length > 64)
        {
            safeLabel = safeLabel[..64];
        }

        if (ReservedAliases.IsReserved(safeLabel))
        {
            return null;
        }

        for (var attempt = 0; attempt < AddressAttempts; attempt++)
        {
            var suffix = GenerateSuffix(policy.SuffixLength);
            var address = policy.BuildAddress(safeLabel, suffix);
            var addressHash = HashAddress(address);
            if (await aliases.IsAddressHashTombstonedAsync(addressHash, cancellationToken))
            {
                continue;
            }

            var now = timeProvider.GetUtcNow();
            var alias = new Alias
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Label = safeLabel,
                RandomSuffix = suffix,
                FullAddress = address,
                FullAddressHash = addressHash,
                PurposeMetadata = string.IsNullOrWhiteSpace(purposeMetadata) ? null : purposeMetadata,
                Category = NormalizeCategory(category),
                Status = AliasStatus.Active,
                CreatedAt = now,
                KvDirty = false
            };

            var created = await aliases.CreateAsync(alias, cancellationToken);
            await PublishAsync(created, user.EffectiveForwardingAddress, "active", cancellationToken);
            return created;
        }

        return null;
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
        if (!success)
        {
            return false;
        }

        await PublishCurrentStateAsync(userId, aliasId, "disabled", cancellationToken);
        return true;
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
                // The tombstone is authoritative; the KV delete is retried by reconciliation.
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
        if (!success)
        {
            return false;
        }

        await PublishCurrentStateAsync(userId, aliasId, "replaced", cancellationToken);
        return true;
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

    public async Task<IReadOnlyCollection<ExpectedSender>> CopyExpectedSendersAsync(
        Guid userId,
        Guid sourceAliasId,
        Guid targetAliasId,
        CancellationToken cancellationToken) =>
        await aliases.CopyExpectedSendersAsync(sourceAliasId, targetAliasId, userId, cancellationToken);

    public static string HashAddress(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    private static string NormalizeCategory(string? category)
    {
        if (string.IsNullOrWhiteSpace(category))
        {
            return DefaultCategory;
        }

        var trimmed = category.Trim();
        return trimmed.Length > CategoryMaxLength ? trimmed[..CategoryMaxLength] : trimmed;
    }

    private async Task PublishCurrentStateAsync(
        Guid userId,
        Guid aliasId,
        string status,
        CancellationToken cancellationToken)
    {
        var alias = await aliases.GetOwnedAliasAsync(aliasId, userId, cancellationToken);
        if (alias?.FullAddress is null)
        {
            return;
        }

        var user = await accounts.FindByIdAsync(userId, cancellationToken);
        if (user is null)
        {
            return;
        }

        await PublishAsync(alias, user.EffectiveForwardingAddress, status, cancellationToken);
    }

    private async Task PublishAsync(
        Alias alias,
        string destination,
        string status,
        CancellationToken cancellationToken)
    {
        if (alias.FullAddress is null || alias.UserId is null)
        {
            return;
        }

        try
        {
            await kvWriter.PutAsync(
                alias.FullAddress.ToLowerInvariant(),
                AliasKvRecord.Serialize(destination, status, alias.UserId.Value),
                cancellationToken);
        }
        catch
        {
            await aliases.MarkKvDirtyAsync(alias.Id, cancellationToken);
        }
    }

    private static string GenerateSuffix(int length) =>
        Guid.NewGuid().ToString("N")[..length];
}
