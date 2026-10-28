using System.Security.Cryptography;
using System.Text;
using Postern.Domain.Aliases;

namespace Postern.Application.Aliases;

public sealed class AliasService(
    IAliasRepository aliases,
    TimeProvider timeProvider)
{
    public async Task<Alias> CreateAsync(
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

        return await aliases.CreateAsync(alias, cancellationToken);
    }

    public async Task<IReadOnlyCollection<Alias>> ListAsync(
        Guid userId,
        CancellationToken cancellationToken) =>
        await aliases.ListByUserAsync(userId, cancellationToken);

    public async Task<bool> DisableAsync(
        Guid userId,
        Guid aliasId,
        CancellationToken cancellationToken) =>
        await aliases.UpdateStatusAsync(aliasId, userId, AliasStatus.Disabled, timeProvider.GetUtcNow(), cancellationToken);

    public async Task<bool> DeleteAsync(
        Guid userId,
        Guid aliasId,
        CancellationToken cancellationToken) =>
        await aliases.DeleteAsync(aliasId, userId, timeProvider.GetUtcNow(), cancellationToken);

    public async Task<bool> ReplaceAsync(
        Guid userId,
        Guid aliasId,
        Guid replacementAliasId,
        CancellationToken cancellationToken) =>
        await aliases.MarkReplacedAsync(aliasId, userId, replacementAliasId, timeProvider.GetUtcNow(), cancellationToken);

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

        var normalized = senderEtld1.Trim();
        if (normalized.Length > 253)
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

    public static string HashAddress(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
}
