using Postern.Application.Aliases;
using Postern.Domain.Aliases;
using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public class AliasServiceMoreTests
{
    [Fact]
    public async Task CreateAsync_TrimsLabel_RespectsMaxLength()
    {
        var timeProvider = new FixedTimeProvider(DateTimeOffset.UtcNow);
        var repo = new InMemoryAliasRepository();
        var kv = new InMemoryKvWriter();
        var service = TestAliasService.Create(repo, timeProvider, kv);

        var longLabel = new string('a', 100);
        var alias = await service.CreateAsync(Guid.NewGuid(), longLabel, "p", CancellationToken.None);
        Assert.NotNull(alias);
        Assert.True(alias.Label!.Length <= 64);
    }

    [Fact]
    public async Task CreateAsync_ReservedLabel_ReturnsNull()
    {
        var timeProvider = new FixedTimeProvider(DateTimeOffset.UtcNow);
        var repo = new InMemoryAliasRepository();
        var kv = new InMemoryKvWriter();
        var service = TestAliasService.Create(repo, timeProvider, kv);

        var alias = await service.CreateAsync(Guid.NewGuid(), "postmaster", "p", CancellationToken.None);
        Assert.Null(alias);
    }

    [Fact]
    public async Task CreateAsync_EmptyLabel_UsesDefault()
    {
        var timeProvider = new FixedTimeProvider(DateTimeOffset.UtcNow);
        var repo = new InMemoryAliasRepository();
        var kv = new InMemoryKvWriter();
        var service = TestAliasService.Create(repo, timeProvider, kv);

        var alias = await service.CreateAsync(Guid.NewGuid(), "   ", "p", CancellationToken.None);
        Assert.NotNull(alias);
        Assert.Equal("default", alias.Label);
    }

    [Fact]
    public async Task DisableAsync_OwnedAlias_Succeeds()
    {
        var timeProvider = new FixedTimeProvider(DateTimeOffset.UtcNow);
        var repo = new InMemoryAliasRepository();
        var kv = new InMemoryKvWriter();
        var service = TestAliasService.Create(repo, timeProvider, kv);

        var userId = Guid.NewGuid();
        var alias = await service.CreateAsync(userId, "test", "p", CancellationToken.None);
        var result = await service.DisableAsync(userId, alias!.Id, CancellationToken.None);
        Assert.True(result);
    }

    [Fact]
    public async Task ReplaceAsync_OwnedAlias_Succeeds()
    {
        var timeProvider = new FixedTimeProvider(DateTimeOffset.UtcNow);
        var repo = new InMemoryAliasRepository();
        var kv = new InMemoryKvWriter();
        var service = TestAliasService.Create(repo, timeProvider, kv);

        var userId = Guid.NewGuid();
        var orig = await service.CreateAsync(userId, "orig", "p1", CancellationToken.None);
        var repl = await service.CreateAsync(userId, "repl", "p2", CancellationToken.None);
        var result = await service.ReplaceAsync(userId, orig!.Id, repl!.Id, CancellationToken.None);
        Assert.True(result);
    }

    [Fact]
    public async Task ListAsync_ReturnsUserAliases()
    {
        var timeProvider = new FixedTimeProvider(DateTimeOffset.UtcNow);
        var repo = new InMemoryAliasRepository();
        var kv = new InMemoryKvWriter();
        var service = TestAliasService.Create(repo, timeProvider, kv);

        var userId = Guid.NewGuid();
        await service.CreateAsync(userId, "a", "p1", CancellationToken.None);
        await service.CreateAsync(userId, "b", "p2", CancellationToken.None);
        var list = await service.ListAsync(userId, CancellationToken.None);
        Assert.Equal(2, list.Count);
    }

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    private sealed class InMemoryAliasRepository : IAliasRepository
    {
        private readonly List<Alias> _aliases = [];
        public Task<Alias> CreateAsync(Alias alias, CancellationToken cancellationToken) { _aliases.Add(alias); return Task.FromResult(alias); }
        public Task<IReadOnlyCollection<Alias>> ListByUserAsync(Guid userId, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyCollection<Alias>>(_aliases.Where(a => a.UserId == userId).ToList());
        public Task<Alias?> GetOwnedAliasAsync(Guid aliasId, Guid userId, CancellationToken cancellationToken) => Task.FromResult(_aliases.SingleOrDefault(a => a.Id == aliasId && a.UserId == userId));
        public Task<bool> UpdateStatusAsync(Guid aliasId, Guid userId, AliasStatus nextStatus, DateTimeOffset updatedAt, CancellationToken cancellationToken)
        {
            var alias = _aliases.SingleOrDefault(a => a.Id == aliasId && a.UserId == userId && AliasLifecycle.CanTransition(a.Status, nextStatus));
            if (alias is null) return Task.FromResult(false);
            alias.Status = nextStatus;
            alias.DeletedAt = nextStatus == AliasStatus.Deleted ? updatedAt : null;
            return Task.FromResult(true);
        }
        public Task<bool> MarkReplacedAsync(Guid aliasId, Guid userId, Guid replacementAliasId, DateTimeOffset updatedAt, CancellationToken cancellationToken)
        {
            var alias = _aliases.SingleOrDefault(a => a.Id == aliasId && a.UserId == userId && a.Status == AliasStatus.Active);
            if (alias is null) return Task.FromResult(false);
            alias.Status = AliasStatus.Replaced;
            alias.ReplacedByAliasId = replacementAliasId;
            return Task.FromResult(true);
        }
        public Task<bool> DeleteAsync(Guid aliasId, Guid userId, DateTimeOffset deletedAt, CancellationToken cancellationToken)
        {
            var alias = _aliases.SingleOrDefault(a => a.Id == aliasId && a.UserId == userId && AliasLifecycle.CanTransition(a.Status, AliasStatus.Deleted));
            if (alias is null) return Task.FromResult(false);
            alias.Status = AliasStatus.Deleted;
            alias.UserId = null; alias.Label = null; alias.RandomSuffix = null; alias.FullAddress = null; alias.PurposeMetadata = null; alias.Category = null; alias.ReplacedByAliasId = null; alias.KvDirty = false; alias.DeletedAt = deletedAt;
            return Task.FromResult(true);
        }
        public Task<bool> IsAddressHashTombstonedAsync(string fullAddressHash, CancellationToken cancellationToken) => Task.FromResult(_aliases.Any(a => a.FullAddressHash == fullAddressHash && a.Status == AliasStatus.Deleted));
        public Task MarkKvDirtyAsync(Guid aliasId, CancellationToken cancellationToken) { var a = _aliases.SingleOrDefault(x => x.Id == aliasId); if (a != null) a.KvDirty = true; return Task.CompletedTask; }
        public Task<IReadOnlyCollection<ExpectedSender>> ListExpectedSendersAsync(Guid aliasId, Guid userId, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyCollection<ExpectedSender>>([]);
        public Task<ExpectedSender?> AddExpectedSenderAsync(Guid aliasId, Guid userId, string senderEtld1, DateTimeOffset createdAt, CancellationToken cancellationToken) => Task.FromResult<ExpectedSender?>(null);
        public Task<bool> BlockSenderAsync(Guid aliasId, Guid userId, string senderEtld1, CancellationToken cancellationToken) => Task.FromResult(true);
        public Task<IReadOnlyCollection<ExpectedSender>> CopyExpectedSendersAsync(Guid sourceAliasId, Guid targetAliasId, Guid userId, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyCollection<ExpectedSender>>(Array.Empty<ExpectedSender>());
    }
}
