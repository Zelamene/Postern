using Postern.Application.Aliases;
using Postern.Domain.Aliases;
using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public class AliasServiceKvFailureTests
{
    [Fact]
    public async Task CreateAsync_WhenKvWriteFails_StillCreatesAliasAndMarksItDirty()
    {
        var repo = new RecordingAliasRepository();
        var kv = new InMemoryKvWriter { ShouldFail = true };
        var service = new AliasService(repo, TimeProvider.System, kv);
        var userId = Guid.NewGuid();

        var alias = await service.CreateAsync(userId, "shop", "", CancellationToken.None);

        Assert.NotNull(alias);
        Assert.Equal(AliasStatus.Active, alias!.Status);
        Assert.Equal(alias.Id, repo.DirtyAliasId);
    }

    [Fact]
    public async Task CreateAsync_WhenKvWriteSucceeds_LeavesAliasClean()
    {
        var repo = new RecordingAliasRepository();
        var kv = new InMemoryKvWriter();
        var service = new AliasService(repo, TimeProvider.System, kv);
        var userId = Guid.NewGuid();

        var alias = await service.CreateAsync(userId, "shop", "{}", CancellationToken.None);

        Assert.NotNull(alias);
        Assert.Null(repo.DirtyAliasId);
        Assert.True(kv.Values.ContainsKey(alias!.FullAddress!.ToLowerInvariant()));
    }

    [Fact]
    public async Task DisableAsync_WhenKvWriteFails_StillMarksAliasDisabledAndDirty()
    {
        var repo = new RecordingAliasRepository();
        var service = new AliasService(repo, TimeProvider.System, new InMemoryKvWriter { ShouldFail = true });
        var userId = Guid.NewGuid();
        var alias = repo.Seed(userId);

        var disabled = await service.DisableAsync(userId, alias.Id, CancellationToken.None);

        Assert.True(disabled);
        Assert.Equal(alias.Id, repo.DirtyAliasId);
    }

    [Fact]
    public async Task DeleteAsync_WhenKvDeleteFails_StillReturnsTombstoneSuccess()
    {
        var repo = new RecordingAliasRepository();
        var service = new AliasService(repo, TimeProvider.System, new InMemoryKvWriter { ShouldFail = true });
        var userId = Guid.NewGuid();
        var alias = repo.Seed(userId);

        Assert.True(await service.DeleteAsync(userId, alias.Id, CancellationToken.None));
        Assert.True(repo.DeleteCalled);
    }

    [Fact]
    public async Task ReplaceAsync_WhenKvWriteFails_StillReplacesAndMarksDirty()
    {
        var repo = new RecordingAliasRepository();
        var service = new AliasService(repo, TimeProvider.System, new InMemoryKvWriter { ShouldFail = true });
        var userId = Guid.NewGuid();
        var alias = repo.Seed(userId);

        var replaced = await service.ReplaceAsync(userId, alias.Id, Guid.NewGuid(), CancellationToken.None);

        Assert.True(replaced);
        Assert.Equal(alias.Id, repo.DirtyAliasId);
    }

    private sealed class RecordingAliasRepository : IAliasRepository
    {
        private readonly List<Alias> _aliases = [];

        public Guid? DirtyAliasId { get; private set; }
        public bool DeleteCalled { get; private set; }

        public Alias Seed(Guid userId)
        {
            var alias = new Alias
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                Label = "seed",
                RandomSuffix = "abcd1234",
                FullAddress = $"seed-abcd1234-{userId:N}@postern.local",
                FullAddressHash = AliasService.HashAddress($"seed-abcd1234-{userId:N}@postern.local"),
                Category = "personal",
                Status = AliasStatus.Active,
                CreatedAt = DateTimeOffset.UtcNow
            };
            _aliases.Add(alias);
            return alias;
        }

        public Task<Alias> CreateAsync(Alias alias, CancellationToken cancellationToken)
        {
            _aliases.Add(alias);
            return Task.FromResult(alias);
        }

        public Task<IReadOnlyCollection<Alias>> ListByUserAsync(Guid userId, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyCollection<Alias>>(
                _aliases.Where(alias => alias.UserId == userId).ToList());

        public Task<Alias?> GetOwnedAliasAsync(Guid aliasId, Guid userId, CancellationToken cancellationToken) =>
            Task.FromResult(_aliases.SingleOrDefault(alias => alias.Id == aliasId && alias.UserId == userId));

        public Task<bool> UpdateStatusAsync(
            Guid aliasId,
            Guid userId,
            AliasStatus nextStatus,
            DateTimeOffset updatedAt,
            CancellationToken cancellationToken)
        {
            var alias = _aliases.SingleOrDefault(item => item.Id == aliasId && item.UserId == userId);
            if (alias is null)
            {
                return Task.FromResult(false);
            }

            alias.Status = nextStatus;
            return Task.FromResult(true);
        }

        public Task<bool> MarkReplacedAsync(
            Guid aliasId,
            Guid userId,
            Guid replacementAliasId,
            DateTimeOffset updatedAt,
            CancellationToken cancellationToken)
        {
            var alias = _aliases.SingleOrDefault(item => item.Id == aliasId && item.UserId == userId);
            if (alias is null)
            {
                return Task.FromResult(false);
            }

            alias.Status = AliasStatus.Replaced;
            alias.ReplacedByAliasId = replacementAliasId;
            return Task.FromResult(true);
        }

        public Task<bool> DeleteAsync(
            Guid aliasId,
            Guid userId,
            DateTimeOffset deletedAt,
            CancellationToken cancellationToken)
        {
            DeleteCalled = true;
            return Task.FromResult(_aliases.Any(item => item.Id == aliasId && item.UserId == userId));
        }

        public Task<bool> IsAddressHashTombstonedAsync(string fullAddressHash, CancellationToken cancellationToken) =>
            Task.FromResult(false);

        public Task MarkKvDirtyAsync(Guid aliasId, CancellationToken cancellationToken)
        {
            DirtyAliasId = aliasId;
            return Task.CompletedTask;
        }

        public Task<IReadOnlyCollection<ExpectedSender>> ListExpectedSendersAsync(
            Guid aliasId,
            Guid userId,
            CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyCollection<ExpectedSender>>([]);

        public Task<ExpectedSender?> AddExpectedSenderAsync(
            Guid aliasId,
            Guid userId,
            string senderEtld1,
            DateTimeOffset createdAt,
            CancellationToken cancellationToken) =>
            Task.FromResult<ExpectedSender?>(null);

        public Task<bool> BlockSenderAsync(
            Guid aliasId,
            Guid userId,
            string senderEtld1,
            CancellationToken cancellationToken) =>
            Task.FromResult(true);

        public Task<IReadOnlyCollection<ExpectedSender>> CopyExpectedSendersAsync(
            Guid sourceAliasId,
            Guid targetAliasId,
            Guid userId,
            CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyCollection<ExpectedSender>>([]);
    }
}
