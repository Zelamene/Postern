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
        CancellationToken cancellationToken)
    {
        var alias = await dbContext.Aliases
            .SingleOrDefaultAsync(a => a.Id == aliasId && a.UserId == userId, cancellationToken);
        if (alias is null || !AliasLifecycle.CanTransition(alias.Status, nextStatus))
        {
            return false;
        }
        alias.Status = nextStatus;
        alias.DeletedAt = nextStatus == AliasStatus.Deleted ? updatedAt : null;
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> MarkReplacedAsync(
        Guid aliasId,
        Guid userId,
        Guid replacementAliasId,
        DateTimeOffset updatedAt,
        CancellationToken cancellationToken)
    {
        var alias = await dbContext.Aliases
            .SingleOrDefaultAsync(a => a.Id == aliasId && a.UserId == userId && a.Status == AliasStatus.Active, cancellationToken);
        if (alias is null)
        {
            return false;
        }
        alias.Status = AliasStatus.Replaced;
        alias.ReplacedByAliasId = replacementAliasId;
        alias.DeletedAt = null;
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> DeleteAsync(
        Guid aliasId,
        Guid userId,
        DateTimeOffset deletedAt,
        CancellationToken cancellationToken)
    {
        var alias = await dbContext.Aliases
            .SingleOrDefaultAsync(a => a.Id == aliasId && a.UserId == userId, cancellationToken);
        if (alias is null || !AliasLifecycle.CanTransition(alias.Status, AliasStatus.Deleted))
        {
            return false;
        }
        alias.Status = AliasStatus.Deleted;
        alias.UserId = null;
        alias.Label = null;
        alias.RandomSuffix = null;
        alias.FullAddress = null;
        alias.PurposeMetadata = null;
        alias.Category = null;
        alias.ReplacedByAliasId = null;
        alias.KvDirty = false;
        alias.DeletedAt = deletedAt;
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> IsAddressHashTombstonedAsync(string fullAddressHash, CancellationToken cancellationToken) =>
        await dbContext.Aliases
            .AsNoTracking()
            .AnyAsync(alias => alias.FullAddressHash == fullAddressHash && alias.Status == AliasStatus.Deleted, cancellationToken);

    public async Task MarkKvDirtyAsync(Guid aliasId, CancellationToken cancellationToken)
    {
        await dbContext.Aliases
            .Where(alias => alias.Id == aliasId)
            .ExecuteUpdateAsync(setters => setters.SetProperty(alias => alias.KvDirty, true), cancellationToken);
    }

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

        var existing = await dbContext.ExpectedSenders.SingleOrDefaultAsync(
            sender => sender.AliasId == aliasId
                && sender.SenderAddress == null
                && sender.SenderEtld1 == senderEtld1,
            cancellationToken);
        if (existing is not null)
        {
            if (existing.IsBlocked || !existing.TrustWholeDomain)
            {
                existing.IsBlocked = false;
                existing.TrustWholeDomain = true;
                await dbContext.SaveChangesAsync(cancellationToken);
            }

            return existing;
        }

        var entry = new ExpectedSender
        {
            Id = Guid.NewGuid(),
            AliasId = aliasId,
            SenderEtld1 = senderEtld1,
            TrustWholeDomain = true,
            CreatedAt = createdAt
        };

        dbContext.ExpectedSenders.Add(entry);
        await dbContext.SaveChangesAsync(cancellationToken);
        return entry;
    }

    public async Task<ExpectedSender?> AddExpectedAddressSenderAsync(
        Guid aliasId,
        Guid userId,
        string senderAddress,
        string senderEtld1,
        DateTimeOffset createdAt,
        CancellationToken cancellationToken)
    {
        var alias = await GetOwnedAliasAsync(aliasId, userId, cancellationToken);
        if (alias is null)
        {
            return null;
        }

        var existing = await dbContext.ExpectedSenders.SingleOrDefaultAsync(
            sender => sender.AliasId == aliasId && sender.SenderAddress == senderAddress,
            cancellationToken);
        if (existing is not null)
        {
            if (existing.IsBlocked || existing.TrustWholeDomain)
            {
                existing.IsBlocked = false;
                existing.TrustWholeDomain = false;
                await dbContext.SaveChangesAsync(cancellationToken);
            }

            return existing;
        }

        var entry = new ExpectedSender
        {
            Id = Guid.NewGuid(),
            AliasId = aliasId,
            SenderEtld1 = senderEtld1,
            SenderAddress = senderAddress,
            TrustWholeDomain = false,
            CreatedAt = createdAt
        };

        dbContext.ExpectedSenders.Add(entry);
        await dbContext.SaveChangesAsync(cancellationToken);
        return entry;
    }

    public async Task<bool> BlockSenderAsync(
        Guid aliasId,
        Guid userId,
        string senderEtld1,
        CancellationToken cancellationToken)
    {
        var alias = await GetOwnedAliasAsync(aliasId, userId, cancellationToken);
        if (alias is null)
        {
            return false;
        }

        var sender = await dbContext.ExpectedSenders.SingleOrDefaultAsync(
            item => item.AliasId == aliasId
                && item.SenderAddress == null
                && item.SenderEtld1 == senderEtld1,
            cancellationToken);

        if (sender is null)
        {
            dbContext.ExpectedSenders.Add(new ExpectedSender
            {
                Id = Guid.NewGuid(),
                AliasId = aliasId,
                SenderEtld1 = senderEtld1,
                TrustWholeDomain = true,
                IsBlocked = true,
                CreatedAt = DateTimeOffset.UtcNow
            });
        }
        else
        {
            sender.IsBlocked = true;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await MarkKvDirtyAsync(aliasId, cancellationToken);
        return true;
    }

    public async Task<IReadOnlyCollection<ExpectedSender>> CopyExpectedSendersAsync(
        Guid sourceAliasId,
        Guid targetAliasId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var sourceOwned = await GetOwnedAliasAsync(sourceAliasId, userId, cancellationToken);
        var targetOwned = await GetOwnedAliasAsync(targetAliasId, userId, cancellationToken);
        if (sourceOwned is null || targetOwned is null)
        {
            return Array.Empty<ExpectedSender>();
        }

        var existing = await dbContext.ExpectedSenders
            .Where(sender => sender.AliasId == sourceAliasId)
            .ToListAsync(cancellationToken);

        var copied = new List<ExpectedSender>();
        foreach (var sender in existing)
        {
            var alreadyExists = await dbContext.ExpectedSenders.AnyAsync(
                item => item.AliasId == targetAliasId
                    && item.SenderEtld1 == sender.SenderEtld1
                    && item.SenderAddress == sender.SenderAddress,
                cancellationToken);
            if (alreadyExists)
            {
                continue;
            }

            var entry = new ExpectedSender
            {
                Id = Guid.NewGuid(),
                AliasId = targetAliasId,
                SenderEtld1 = sender.SenderEtld1,
                SenderAddress = sender.SenderAddress,
                TrustWholeDomain = sender.TrustWholeDomain,
                IsBlocked = sender.IsBlocked,
                CreatedAt = DateTimeOffset.UtcNow
            };

            dbContext.ExpectedSenders.Add(entry);
            copied.Add(entry);
        }

        if (copied.Count > 0)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return copied;
    }
}
