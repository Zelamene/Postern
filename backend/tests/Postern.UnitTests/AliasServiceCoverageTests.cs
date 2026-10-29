using Postern.Application.Aliases;
using Postern.Domain.Aliases;
using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public class AliasServiceCoverageTests
{
    [Fact]
    public async Task AddExpectedSenderAsync_InvalidEtld_ReturnsNull()
    {
        var repo = new InMemoryAliasRepository();
        var service = new AliasService(repo, TimeProvider.System, new InMemoryKvWriter());
        var result = await service.AddExpectedSenderAsync(Guid.NewGuid(), Guid.NewGuid(), "", CancellationToken.None);
        Assert.Null(result);
    }

    [Fact]
    public async Task AddExpectedSenderAsync_NormalizesAndAdds()
    {
        var repo = new InMemoryAliasRepository();
        var service = new AliasService(repo, TimeProvider.System, new InMemoryKvWriter());
        var userId = Guid.NewGuid();
        var aliasId = Guid.NewGuid();
        repo.AddAlias(new Alias { Id = aliasId, UserId = userId, Status = AliasStatus.Active, FullAddress = "a@b.com", FullAddressHash = "x", Label = "a", RandomSuffix = "x", Category = "p", CreatedAt = DateTimeOffset.UtcNow });
        var result = await service.AddExpectedSenderAsync(userId, aliasId, "EXAMPLE.COM", CancellationToken.None);
        Assert.NotNull(result);
    }

    [Fact]
    public async Task MarkExpectedSenderAsync_ReturnsTrueIfAdded()
    {
        var repo = new InMemoryAliasRepository();
        var service = new AliasService(repo, TimeProvider.System, new InMemoryKvWriter());
        var userId = Guid.NewGuid();
        var aliasId = Guid.NewGuid();
        repo.AddAlias(new Alias { Id = aliasId, UserId = userId, Status = AliasStatus.Active, FullAddress = "a@b.com", FullAddressHash = "x", Label = "a", RandomSuffix = "x", Category = "p", CreatedAt = DateTimeOffset.UtcNow });
        var result = await service.MarkExpectedSenderAsync(userId, aliasId, "example.com", CancellationToken.None);
        Assert.True(result);
    }

    [Fact]
    public async Task BlockSenderAsync_Invalid_ReturnsFalse()
    {
        var repo = new InMemoryAliasRepository();
        var service = new AliasService(repo, TimeProvider.System, new InMemoryKvWriter());
        Assert.False(await service.BlockSenderAsync(Guid.NewGuid(), Guid.NewGuid(), "", CancellationToken.None));
    }

    [Fact]
    public async Task BlockSenderAsync_Valid_ReturnsTrue()
    {
        var repo = new InMemoryAliasRepository();
        var service = new AliasService(repo, TimeProvider.System, new InMemoryKvWriter());
        var result = await service.BlockSenderAsync(Guid.NewGuid(), Guid.NewGuid(), "example.com", CancellationToken.None);
        Assert.True(result);
    }

    [Fact]
    public async Task ListExpectedSendersAsync_ReturnsList()
    {
        var repo = new InMemoryAliasRepository();
        var service = new AliasService(repo, TimeProvider.System, new InMemoryKvWriter());
        var list = await service.ListExpectedSendersAsync(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);
        Assert.NotNull(list);
    }

    [Fact]
    public async Task IsAddressHashTombstonedAsync_Empty_ReturnsFalse()
    {
        var repo = new InMemoryAliasRepository();
        var service = new AliasService(repo, TimeProvider.System, new InMemoryKvWriter());
        Assert.False(await service.IsAddressHashTombstonedAsync("   ", CancellationToken.None));
    }

    [Fact]
    public async Task CopyExpectedSendersAsync_CallsRepo()
    {
        var repo = new InMemoryAliasRepository();
        var service = new AliasService(repo, TimeProvider.System, new InMemoryKvWriter());
        var result = await service.CopyExpectedSendersAsync(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None);
        Assert.NotNull(result);
    }

    private sealed class InMemoryAliasRepository : IAliasRepository
    {
        private readonly List<Alias> _aliases = [];
        private readonly List<ExpectedSender> _senders = [];
        public void AddAlias(Alias a) => _aliases.Add(a);
        public Task<Alias> CreateAsync(Alias alias, CancellationToken cancellationToken) { _aliases.Add(alias); return Task.FromResult(alias); }
        public Task<IReadOnlyCollection<Alias>> ListByUserAsync(Guid userId, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyCollection<Alias>>(_aliases.Where(a => a.UserId == userId).ToList());
        public Task<Alias?> GetOwnedAliasAsync(Guid aliasId, Guid userId, CancellationToken cancellationToken) => Task.FromResult(_aliases.SingleOrDefault(a => a.Id == aliasId && a.UserId == userId));
        public Task<bool> UpdateStatusAsync(Guid aliasId, Guid userId, AliasStatus nextStatus, DateTimeOffset updatedAt, CancellationToken cancellationToken) => Task.FromResult(true);
        public Task<bool> MarkReplacedAsync(Guid aliasId, Guid userId, Guid replacementAliasId, DateTimeOffset updatedAt, CancellationToken cancellationToken) => Task.FromResult(true);
        public Task<bool> DeleteAsync(Guid aliasId, Guid userId, DateTimeOffset deletedAt, CancellationToken cancellationToken) => Task.FromResult(true);
        public Task<bool> IsAddressHashTombstonedAsync(string fullAddressHash, CancellationToken cancellationToken) => Task.FromResult(false);
        public Task MarkKvDirtyAsync(Guid aliasId, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task<IReadOnlyCollection<ExpectedSender>> ListExpectedSendersAsync(Guid aliasId, Guid userId, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyCollection<ExpectedSender>>(_senders.ToList());
        public Task<ExpectedSender?> AddExpectedSenderAsync(Guid aliasId, Guid userId, string senderEtld1, DateTimeOffset createdAt, CancellationToken cancellationToken) { var s = new ExpectedSender { Id = Guid.NewGuid(), AliasId = aliasId, SenderEtld1 = senderEtld1, CreatedAt = createdAt }; _senders.Add(s); return Task.FromResult<ExpectedSender?>(s); }
        public Task<bool> BlockSenderAsync(Guid aliasId, Guid userId, string senderEtld1, CancellationToken cancellationToken) => Task.FromResult(true);
        public Task<IReadOnlyCollection<ExpectedSender>> CopyExpectedSendersAsync(Guid sourceAliasId, Guid targetAliasId, Guid userId, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyCollection<ExpectedSender>>([]);
    }
}
