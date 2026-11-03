using Postern.Domain.Aliases;

namespace Postern.Application.Aliases;

public interface IAliasRepository
{
    Task<Alias> CreateAsync(Alias alias, CancellationToken cancellationToken);

    Task<IReadOnlyCollection<Alias>> ListByUserAsync(Guid userId, CancellationToken cancellationToken);

    Task<Alias?> GetOwnedAliasAsync(Guid aliasId, Guid userId, CancellationToken cancellationToken);

    Task<bool> UpdateStatusAsync(
        Guid aliasId,
        Guid userId,
        AliasStatus nextStatus,
        DateTimeOffset updatedAt,
        CancellationToken cancellationToken);

    Task<bool> MarkReplacedAsync(
        Guid aliasId,
        Guid userId,
        Guid replacementAliasId,
        DateTimeOffset updatedAt,
        CancellationToken cancellationToken);

    Task<bool> DeleteAsync(
        Guid aliasId,
        Guid userId,
        DateTimeOffset deletedAt,
        CancellationToken cancellationToken);

    Task<bool> IsAddressHashTombstonedAsync(string fullAddressHash, CancellationToken cancellationToken);

    Task MarkKvDirtyAsync(Guid aliasId, CancellationToken cancellationToken);

    Task<IReadOnlyCollection<ExpectedSender>> ListExpectedSendersAsync(
        Guid aliasId,
        Guid userId,
        CancellationToken cancellationToken);

    Task<ExpectedSender?> AddExpectedSenderAsync(
        Guid aliasId,
        Guid userId,
        string senderEtld1,
        DateTimeOffset createdAt,
        CancellationToken cancellationToken);

    Task<bool> BlockSenderAsync(
        Guid aliasId,
        Guid userId,
        string senderEtld1,
        CancellationToken cancellationToken);

    Task<IReadOnlyCollection<ExpectedSender>> CopyExpectedSendersAsync(
        Guid sourceAliasId,
        Guid targetAliasId,
        Guid userId,
        CancellationToken cancellationToken);
}
