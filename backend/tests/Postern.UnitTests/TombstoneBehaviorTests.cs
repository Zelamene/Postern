using Postern.Application.Accounts;
using Postern.Application.Aliases;
using Postern.Application.Integrations;
using Postern.Domain.Accounts;
using Postern.Domain.Aliases;
using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public class TombstoneBehaviorTests
{
    [Fact]
    public async Task TombstoneFromAliasDeletion_PreservesHashAndClearsPii()
    {
        var timeProvider = new FixedTimeProvider(new DateTimeOffset(2026, 10, 28, 12, 0, 0, TimeSpan.Zero));
        var repository = new InMemoryAliasRepository();
        var kvWriter = new Fakes.InMemoryKvWriter();
        var service = TestAliasService.Create(repository, timeProvider, kvWriter);

        var userId = Guid.NewGuid();
        var alias = await service.CreateAsync(userId, "secret", "test purpose", CancellationToken.None);
        Assert.NotNull(alias);

        var originalHash = alias.FullAddressHash;
        var originalAddress = alias.FullAddress!;

        var deleted = await service.DeleteAsync(userId, alias.Id, CancellationToken.None);
        Assert.True(deleted);

        var tombstoned = await service.IsAddressHashTombstonedAsync(originalAddress, CancellationToken.None);
        Assert.True(tombstoned);

        var tombstonedByHash = await repository.IsAddressHashTombstonedAsync(originalHash, CancellationToken.None);
        Assert.True(tombstonedByHash);
    }

    [Fact]
    public async Task DeletedAlias_ClearsPiiButPreservesHash()
    {
        var timeProvider = new FixedTimeProvider(new DateTimeOffset(2026, 10, 28, 12, 0, 0, TimeSpan.Zero));
        var repository = new InMemoryAliasRepository();
        var kvWriter = new Fakes.InMemoryKvWriter();
        var service = TestAliasService.Create(repository, timeProvider, kvWriter);

        var userId = Guid.NewGuid();
        var alias = await service.CreateAsync(userId, "mylabel", "purpose metadata", CancellationToken.None);
        var originalHash = alias!.FullAddressHash;

        await service.DeleteAsync(userId, alias.Id, CancellationToken.None);

        var deletedAlias = repository.FindById(alias.Id);
        Assert.NotNull(deletedAlias);
        Assert.Equal(AliasStatus.Deleted, deletedAlias.Status);
        Assert.Null(deletedAlias.UserId);
        Assert.Null(deletedAlias.Label);
        Assert.Null(deletedAlias.RandomSuffix);
        Assert.Null(deletedAlias.FullAddress);
        Assert.Null(deletedAlias.PurposeMetadata);
        Assert.Null(deletedAlias.Category);
        Assert.Null(deletedAlias.ReplacedByAliasId);
        Assert.False(deletedAlias.KvDirty);
        Assert.NotNull(deletedAlias.DeletedAt);
        Assert.Equal(originalHash, deletedAlias.FullAddressHash);
    }

    [Fact]
    public async Task ReplacedAlias_HasReplacementReference_TombstoneHashPreserved()
    {
        var timeProvider = new FixedTimeProvider(new DateTimeOffset(2026, 10, 28, 12, 0, 0, TimeSpan.Zero));
        var repository = new InMemoryAliasRepository();
        var kvWriter = new Fakes.InMemoryKvWriter();
        var service = TestAliasService.Create(repository, timeProvider, kvWriter);

        var userId = Guid.NewGuid();
        var original = await service.CreateAsync(userId, "orig", "p1", CancellationToken.None);
        var replacement = await service.CreateAsync(userId, "repl", "p2", CancellationToken.None);
        var originalHash = original!.FullAddressHash;

        var replaced = await service.ReplaceAsync(userId, original.Id, replacement!.Id, CancellationToken.None);
        Assert.True(replaced);

        var replacedAlias = repository.FindById(original.Id);
        Assert.Equal(AliasStatus.Replaced, replacedAlias!.Status);
        Assert.Equal(replacement.Id, replacedAlias.ReplacedByAliasId);
        Assert.Equal(originalHash, replacedAlias.FullAddressHash);
    }

    [Fact]
    public async Task TombstoneCannotBeReissued_PreventsAddressReuse()
    {
        var timeProvider = new FixedTimeProvider(new DateTimeOffset(2026, 10, 28, 12, 0, 0, TimeSpan.Zero));
        var repository = new InMemoryAliasRepository();
        var kvWriter = new Fakes.InMemoryKvWriter();
        var service = TestAliasService.Create(repository, timeProvider, kvWriter);

        var userId = Guid.NewGuid();
        var alias1 = await service.CreateAsync(userId, "test", "p", CancellationToken.None);
        var addr1 = alias1!.FullAddress!;
        await service.DeleteAsync(userId, alias1.Id, CancellationToken.None);

        var tombstoned = await service.IsAddressHashTombstonedAsync(addr1, CancellationToken.None);
        Assert.True(tombstoned);

        var alias2 = await service.CreateAsync(userId, "test", "p", CancellationToken.None);
        Assert.NotNull(alias2);
        Assert.NotEqual(addr1, alias2.FullAddress);
    }

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    private sealed class InMemoryAliasRepository : IAliasRepository
    {
        private readonly List<Alias> _aliases = [];

        public Alias? FindById(Guid id) => _aliases.SingleOrDefault(a => a.Id == id);

        public Task<Alias> CreateAsync(Alias alias, CancellationToken cancellationToken)
        {
            _aliases.Add(alias);
            return Task.FromResult(alias);
        }

        public Task<IReadOnlyCollection<Alias>> ListByUserAsync(Guid userId, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyCollection<Alias>>(_aliases.Where(alias => alias.UserId == userId).ToList());

        public Task<Alias?> GetOwnedAliasAsync(Guid aliasId, Guid userId, CancellationToken cancellationToken) =>
            Task.FromResult(_aliases.SingleOrDefault(alias => alias.Id == aliasId && alias.UserId == userId));

        public Task<bool> UpdateStatusAsync(Guid aliasId, Guid userId, AliasStatus nextStatus, DateTimeOffset updatedAt, CancellationToken cancellationToken)
        {
            var alias = _aliases.SingleOrDefault(item => item.Id == aliasId && item.UserId == userId && AliasLifecycle.CanTransition(item.Status, nextStatus));
            if (alias is null) return Task.FromResult(false);
            alias.Status = nextStatus;
            alias.DeletedAt = nextStatus == AliasStatus.Deleted ? updatedAt : null;
            return Task.FromResult(true);
        }

        public Task<bool> MarkReplacedAsync(Guid aliasId, Guid userId, Guid replacementAliasId, DateTimeOffset updatedAt, CancellationToken cancellationToken)
        {
            var alias = _aliases.SingleOrDefault(item => item.Id == aliasId && item.UserId == userId && item.Status == AliasStatus.Active);
            if (alias is null) return Task.FromResult(false);
            alias.Status = AliasStatus.Replaced;
            alias.ReplacedByAliasId = replacementAliasId;
            alias.DeletedAt = null;
            return Task.FromResult(true);
        }

        public Task<bool> DeleteAsync(Guid aliasId, Guid userId, DateTimeOffset deletedAt, CancellationToken cancellationToken)
        {
            var alias = _aliases.SingleOrDefault(item => item.Id == aliasId && item.UserId == userId && AliasLifecycle.CanTransition(item.Status, AliasStatus.Deleted));
            if (alias is null) return Task.FromResult(false);
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
            return Task.FromResult(true);
        }

        public Task<bool> IsAddressHashTombstonedAsync(string fullAddressHash, CancellationToken cancellationToken) =>
            Task.FromResult(_aliases.Any(alias => alias.FullAddressHash == fullAddressHash && alias.Status == AliasStatus.Deleted));

        public Task MarkKvDirtyAsync(Guid aliasId, CancellationToken cancellationToken)
        {
            var alias = _aliases.SingleOrDefault(item => item.Id == aliasId);
            if (alias is not null) alias.KvDirty = true;
            return Task.CompletedTask;
        }

        public Task<IReadOnlyCollection<ExpectedSender>> ListExpectedSendersAsync(Guid aliasId, Guid userId, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyCollection<ExpectedSender>>([]);

        public Task<ExpectedSender?> AddExpectedSenderAsync(Guid aliasId, Guid userId, string senderEtld1, DateTimeOffset createdAt, CancellationToken cancellationToken) =>
            Task.FromResult<ExpectedSender?>(null);

        public Task<bool> BlockSenderAsync(Guid aliasId, Guid userId, string senderEtld1, CancellationToken cancellationToken) =>
            Task.FromResult(_aliases.Any(item => item.Id == aliasId && item.UserId == userId));

        public Task<IReadOnlyCollection<ExpectedSender>> CopyExpectedSendersAsync(Guid sourceAliasId, Guid targetAliasId, Guid userId, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyCollection<ExpectedSender>>(Array.Empty<ExpectedSender>());
    }
}
