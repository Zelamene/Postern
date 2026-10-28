using Microsoft.EntityFrameworkCore;
using Postern.Application.Aliases;
using Postern.Domain.Aliases;
using Postern.Infrastructure.Persistence;

namespace Postern.Infrastructure.Aliases;

public sealed class EfAliasRepository(PosternDbContext dbContext) : IAliasRepository
{
    public async Task<Alias> CreateAsync(Alias alias, CancellationToken cancellationToken)
    {
        dbContext.Aliases.Add(alias);
        await dbContext.SaveChangesAsync(cancellationToken);
        return alias;
    }

    public async Task<IReadOnlyCollection<Alias>> ListByUserAsync(Guid userId, CancellationToken cancellationToken) =>
        await dbContext.Aliases
            .AsNoTracking()
            .Where(alias => alias.UserId == userId)
            .OrderByDescending(alias => alias.CreatedAt)
            .ToListAsync(cancellationToken);

    public async Task<Alias?> GetOwnedAliasAsync(Guid aliasId, Guid userId, CancellationToken cancellationToken) =>
        await dbContext.Aliases
            .SingleOrDefaultAsync(alias => alias.Id == aliasId && alias.UserId == userId, cancellationToken);

    public async Task<bool> UpdateStatusAsync(
        Guid aliasId,
        Guid userId,
        AliasStatus nextStatus,
        DateTimeOffset updatedAt,
        CancellationToken cancellationToken) =>
        await dbContext.Aliases
            .Where(alias => alias.Id == aliasId && alias.UserId == userId && AliasLifecycle.CanTransition(alias.Status, nextStatus))
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(alias => alias.Status, nextStatus)
                .SetProperty(alias => alias.DeletedAt, nextStatus == AliasStatus.Deleted ? (DateTimeOffset?)updatedAt : (DateTimeOffset?)null), cancellationToken) == 1;

    public async Task<bool> MarkReplacedAsync(
        Guid aliasId,
        Guid userId,
        Guid replacementAliasId,
        DateTimeOffset updatedAt,
        CancellationToken cancellationToken) =>
        await dbContext.Aliases
            .Where(alias => alias.Id == aliasId && alias.UserId == userId && alias.Status == AliasStatus.Active)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(alias => alias.Status, AliasStatus.Replaced)
                .SetProperty(alias => alias.ReplacedByAliasId, (Guid?)replacementAliasId)
                .SetProperty(alias => alias.DeletedAt, (DateTimeOffset?)null), cancellationToken) == 1;

    public async Task<bool> DeleteAsync(
        Guid aliasId,
        Guid userId,
        DateTimeOffset deletedAt,
        CancellationToken cancellationToken) =>
        await dbContext.Aliases
            .Where(alias => alias.Id == aliasId && alias.UserId == userId && AliasLifecycle.CanTransition(alias.Status, AliasStatus.Deleted))
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(alias => alias.Status, AliasStatus.Deleted)
                .SetProperty(alias => alias.UserId, (Guid?)null)
                .SetProperty(alias => alias.Label, (string?)null)
                .SetProperty(alias => alias.RandomSuffix, (string?)null)
                .SetProperty(alias => alias.FullAddress, (string?)null)
                .SetProperty(alias => alias.PurposeMetadata, (string?)null)
                .SetProperty(alias => alias.Category, (string?)null)
                .SetProperty(alias => alias.ReplacedByAliasId, (Guid?)null)
                .SetProperty(alias => alias.KvDirty, false)
                .SetProperty(alias => alias.DeletedAt, deletedAt), cancellationToken) == 1;

    public async Task<bool> IsAddressHashTombstonedAsync(string fullAddressHash, CancellationToken cancellationToken) =>
        await dbContext.Aliases
            .AsNoTracking()
            .AnyAsync(alias => alias.FullAddressHash == fullAddressHash && alias.Status == AliasStatus.Deleted, cancellationToken);

    public async Task<IReadOnlyCollection<ExpectedSender>> ListExpectedSendersAsync(
        Guid aliasId,
        Guid userId,
        CancellationToken cancellationToken) =>
        await dbContext.ExpectedSenders
            .AsNoTracking()
            .Where(sender => sender.AliasId == aliasId && sender.Alias.UserId == userId)
            .OrderBy(sender => sender.SenderEtld1)
            .ToListAsync(cancellationToken);

    public async Task<ExpectedSender?> AddExpectedSenderAsync(
        Guid aliasId,
        Guid userId,
        string senderEtld1,
        DateTimeOffset createdAt,
        CancellationToken cancellationToken)
    {
        var alias = await GetOwnedAliasAsync(aliasId, userId, cancellationToken);
        if (alias is null)
        {
            return null;
        }

        var entry = new ExpectedSender
        {
            Id = Guid.NewGuid(),
            AliasId = aliasId,
            SenderEtld1 = senderEtld1,
            CreatedAt = createdAt
        };

        dbContext.ExpectedSenders.Add(entry);
        await dbContext.SaveChangesAsync(cancellationToken);
        return entry;
    }
}
