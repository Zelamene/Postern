using Postern.Application.Aliases;
using Postern.Domain.Aliases;
using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public class KvDirtyBehaviorTests
{
    [Fact]
    public async Task KvWriteFailure_OnDisable_MarksAliasKvDirty()
    {
        var timeProvider = new FixedTimeProvider(new DateTimeOffset(2026, 10, 28, 12, 0, 0, TimeSpan.Zero));
        var repository = new InMemoryAliasRepository();
        var kvWriter = new InMemoryKvWriter { ShouldFail = true };
        var service = new AliasService(repository, timeProvider, kvWriter);

        var userId = Guid.NewGuid();
        var alias = await service.CreateAsync(userId, "test", "p", CancellationToken.None);

        var disabled = await service.DisableAsync(userId, alias!.Id, CancellationToken.None);
        Assert.True(disabled);

        var stored = repository.FindById(alias.Id);
        Assert.NotNull(stored);
        Assert.Equal(AliasStatus.Disabled, stored.Status);
        Assert.True(stored.KvDirty);
    }

    [Fact]
    public async Task KvWriteFailure_OnReplace_MarksOldAliasKvDirty()
    {
        var timeProvider = new FixedTimeProvider(new DateTimeOffset(2026, 10, 28, 12, 0, 0, TimeSpan.Zero));
        var repository = new InMemoryAliasRepository();
        var kvWriter = new InMemoryKvWriter { ShouldFail = true };
        var service = new AliasService(repository, timeProvider, kvWriter);

        var userId = Guid.NewGuid();
        var original = await service.CreateAsync(userId, "orig", "p1", CancellationToken.None);
        var replacement = await service.CreateAsync(userId, "repl", "p2", CancellationToken.None);

        var replaced = await service.ReplaceAsync(userId, original!.Id, replacement!.Id, CancellationToken.None);
        Assert.True(replaced);

        var oldAlias = repository.FindById(original.Id);
        Assert.NotNull(oldAlias);
        Assert.Equal(AliasStatus.Replaced, oldAlias.Status);
        Assert.True(oldAlias.KvDirty);
    }

    [Fact]
    public async Task KvDeleteFailure_OnDelete_DoesNotBlockTombstone()
    {
        var timeProvider = new FixedTimeProvider(new DateTimeOffset(2026, 10, 28, 12, 0, 0, TimeSpan.Zero));
        var repository = new InMemoryAliasRepository();
        var kvWriter = new InMemoryKvWriter { ShouldFail = true };
        var service = new AliasService(repository, timeProvider, kvWriter);

        var userId = Guid.NewGuid();
        var alias = await service.CreateAsync(userId, "test", "p", CancellationToken.None);
        var addr = alias!.FullAddress!;

        var deleted = await service.DeleteAsync(userId, alias.Id, CancellationToken.None);
        Assert.True(deleted);

        var tombstoned = await service.IsAddressHashTombstonedAsync(addr, CancellationToken.None);
        Assert.True(tombstoned);

        var deletedAlias = repository.FindById(alias.Id);
        Assert.Equal(AliasStatus.Deleted, deletedAlias!.Status);
        Assert.Null(deletedAlias.FullAddress);
        Assert.False(deletedAlias.KvDirty);
    }

    [Fact]
    public async Task KvDirty_CanBeMarkedForReconciliation()
    {
        var repository = new InMemoryAliasRepository();
        var alias = new Alias
        {
            Id = Guid.NewGuid(),
            UserId = Guid.NewGuid(),
            Label = "test",
            RandomSuffix = "abcd1234",
            FullAddress = "test-abcd1234@postern.local",
            FullAddressHash = AliasService.HashAddress("test-abcd1234@postern.local"),
            PurposeMetadata = "p",
            Category = "personal",
            Status = AliasStatus.Active,
            CreatedAt = DateTimeOffset.UtcNow,
            KvDirty = false
        };
        await repository.CreateAsync(alias, CancellationToken.None);

        await repository.MarkKvDirtyAsync(alias.Id, CancellationToken.None);
        var stored = repository.FindById(alias.Id);
        Assert.True(stored!.KvDirty);
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
