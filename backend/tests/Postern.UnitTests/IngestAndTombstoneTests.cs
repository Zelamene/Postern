using Postern.Application.Activity;
using Postern.Application.Aliases;
using Postern.Domain.Activity;
using Postern.Domain.Aliases;

namespace Postern.UnitTests;

public class IngestAndTombstoneTests
{
    [Fact]
    public async Task IngestAcceptsActiveAlias()
    {
        var timeProvider = new FixedTimeProvider(new DateTimeOffset(2026, 10, 28, 10, 0, 0, TimeSpan.Zero));
        var repository = new InMemoryActivityRepository();
        var alias = CreateAlias("test-example", AliasStatus.Active);
        repository.AddAlias(alias);

        var service = new IngestService(repository, timeProvider);
        var result = await service.IngestAsync(
            "test-example@postern.local",
            "sender@example.com",
            "Sender <sender@example.com>",
            "Hello",
            "pass",
            CancellationToken.None);

        Assert.Equal(IngestResult.Accepted, result);
        Assert.Single(repository.Messages);
    }

    [Fact]
    public async Task IngestBlocksDisabledReplacedOrDeletedAliases()
    {
        var timeProvider = new FixedTimeProvider(new DateTimeOffset(2026, 10, 28, 10, 0, 0, TimeSpan.Zero));
        var repository = new InMemoryActivityRepository();

        foreach (var status in new[] { AliasStatus.Disabled, AliasStatus.Replaced, AliasStatus.Deleted })
        {
            var label = $"test-{status}".Replace(" ", "-").ToLowerInvariant();
            var address = $"{label}@postern.local";
            var alias = CreateAliasWithAddress(label, address, status);
            repository.AddAlias(alias);

            var service = new IngestService(repository, timeProvider);
            var result = await service.IngestAsync(
                address,
                "sender@example.com",
                "Sender <sender@example.com>",
                "Hello",
                "pass",
                CancellationToken.None);

            Assert.Equal(IngestResult.Blocked, result);
        }

        Assert.Equal(3, repository.BlockedMessages.Count);
    }

    [Fact]
    public async Task IngestReturnsUnknownAliasWhenNotFound()
    {
        var timeProvider = new FixedTimeProvider(new DateTimeOffset(2026, 10, 28, 10, 0, 0, TimeSpan.Zero));
        var repository = new InMemoryActivityRepository();
        var service = new IngestService(repository, timeProvider);

        var result = await service.IngestAsync(
            "missing@postern.local",
            "sender@example.com",
            "Sender <sender@example.com>",
            "Hello",
            "pass",
            CancellationToken.None);

        Assert.Equal(IngestResult.UnknownAlias, result);
    }

    [Fact]
    public async Task TombstonePreventsReissuingAddress()
    {
        var timeProvider = new FixedTimeProvider(new DateTimeOffset(2026, 10, 28, 10, 0, 0, TimeSpan.Zero));
        var repository = new InMemoryAliasRepository();
        var kvWriter = new Postern.UnitTests.Fakes.InMemoryKvWriter();
        var service = new AliasService(repository, timeProvider, kvWriter);

        var userId = Guid.NewGuid();
        var alias = await service.CreateAsync(userId, "test", "purpose", CancellationToken.None);
        var originalAddress = alias!.FullAddress!;
        await service.DeleteAsync(userId, alias.Id, CancellationToken.None);

        var tombstoned = await service.IsAddressHashTombstonedAsync(originalAddress, CancellationToken.None);
        Assert.True(tombstoned);
    }

    private static Alias CreateAlias(string label, AliasStatus status)
    {
        var address = $"{label}@postern.local";
        return CreateAliasWithAddress(label, address, status);
    }

    private static Alias CreateAliasWithAddress(string label, string address, AliasStatus status)
    {
        return new Alias
        {
            Id = Guid.NewGuid(),
            UserId = status == AliasStatus.Deleted ? null : Guid.NewGuid(),
            Label = status == AliasStatus.Deleted ? null : label,
            RandomSuffix = status == AliasStatus.Deleted ? null : "abcd1234",
            FullAddress = status == AliasStatus.Deleted ? null : address,
            FullAddressHash = AliasService.HashAddress(address.Trim().ToLowerInvariant()),
            PurposeMetadata = null,
            Category = "personal",
            Status = status,
            CreatedAt = DateTimeOffset.UtcNow,
            DeletedAt = status == AliasStatus.Deleted ? DateTimeOffset.UtcNow : null,
            KvDirty = false
        };
    }

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    private sealed class InMemoryActivityRepository : IActivityRepository
    {
        private readonly List<Alias> _aliases = [];
        public List<Message> Messages { get; } = [];
        public List<BlockedMessage> BlockedMessages { get; } = [];

        public void AddAlias(Alias alias) => _aliases.Add(alias);

        public Task<Alias?> FindAliasForIngestAsync(string fullAddressHash, CancellationToken cancellationToken) =>
            Task.FromResult(_aliases.SingleOrDefault(alias => alias.FullAddressHash == fullAddressHash));

        public Task<Alias?> FindAliasForIngestWithExpectedSendersAsync(string fullAddressHash, CancellationToken cancellationToken) =>
            Task.FromResult(_aliases.SingleOrDefault(alias => alias.FullAddressHash == fullAddressHash));

        public Task<Message> RecordMessageAsync(Message message, CancellationToken cancellationToken)
        {
            Messages.Add(message);
            return Task.FromResult(message);
        }

        public Task<BlockedMessage> RecordBlockedMessageAsync(BlockedMessage blockedMessage, CancellationToken cancellationToken)
        {
            BlockedMessages.Add(blockedMessage);
            return Task.FromResult(blockedMessage);
        }

        public Task AddExpectedSenderAsync(Guid aliasId, string senderEtld1, DateTimeOffset createdAt, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task<int> CountForwardedMessagesLast24HoursAsync(CancellationToken cancellationToken) => Task.FromResult(Messages.Count);
    }

    private sealed class InMemoryAliasRepository : IAliasRepository
    {
        private readonly List<Alias> _aliases = [];

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
            if (alias is null)
            {
                return Task.FromResult(false);
            }

            alias.Status = nextStatus;
            alias.DeletedAt = nextStatus == AliasStatus.Deleted ? updatedAt : null;
            return Task.FromResult(true);
        }

        public Task<bool> MarkReplacedAsync(Guid aliasId, Guid userId, Guid replacementAliasId, DateTimeOffset updatedAt, CancellationToken cancellationToken)
        {
            var alias = _aliases.SingleOrDefault(item => item.Id == aliasId && item.UserId == userId && item.Status == AliasStatus.Active);
            if (alias is null)
            {
                return Task.FromResult(false);
            }

            alias.Status = AliasStatus.Replaced;
            alias.ReplacedByAliasId = replacementAliasId;
            alias.DeletedAt = null;
            return Task.FromResult(true);
        }

        public Task<bool> DeleteAsync(Guid aliasId, Guid userId, DateTimeOffset deletedAt, CancellationToken cancellationToken)
        {
            var alias = _aliases.SingleOrDefault(item => item.Id == aliasId && item.UserId == userId && AliasLifecycle.CanTransition(item.Status, AliasStatus.Deleted));
            if (alias is null)
            {
                return Task.FromResult(false);
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
            return Task.FromResult(true);
        }

        public Task<bool> IsAddressHashTombstonedAsync(string fullAddressHash, CancellationToken cancellationToken) =>
            Task.FromResult(_aliases.Any(alias => alias.FullAddressHash == fullAddressHash && alias.Status == AliasStatus.Deleted));

        public Task MarkKvDirtyAsync(Guid aliasId, CancellationToken cancellationToken)
        {
            var alias = _aliases.SingleOrDefault(item => item.Id == aliasId);
            if (alias is not null)
            {
                alias.KvDirty = true;
            }

            return Task.CompletedTask;
        }

        public Task<IReadOnlyCollection<ExpectedSender>> ListExpectedSendersAsync(Guid aliasId, Guid userId, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyCollection<ExpectedSender>>([]);

        public Task<ExpectedSender?> AddExpectedSenderAsync(Guid aliasId, Guid userId, string senderEtld1, DateTimeOffset createdAt, CancellationToken cancellationToken) =>
            Task.FromResult<ExpectedSender?>(null);

        public Task<bool> BlockSenderAsync(Guid aliasId, Guid userId, string senderEtld1, CancellationToken cancellationToken) =>
            Task.FromResult(_aliases.Any(item => item.Id == aliasId && item.UserId == userId));
    }
}
