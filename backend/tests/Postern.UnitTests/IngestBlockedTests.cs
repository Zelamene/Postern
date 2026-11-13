using Postern.Application.Activity;
using Postern.Application.Aliases;
using Postern.Domain.Activity;
using Postern.Domain.Aliases;

namespace Postern.UnitTests;

public class IngestBlockedTests
{
    private static readonly Guid AliasId = Guid.NewGuid();

    [Fact]
    public async Task BlockedDecision_RecordsBlockedMessageInsteadOfMessage()
    {
        var repository = new RecordingActivityRepository();
        var service = new IngestService(repository, TimeProvider.System);

        var result = await service.IngestAsync(
            new IngestRequest(
                "shop.abcd@postern.local",
                "promo@spamco.ru",
                "Promo <promo@spamco.ru>",
                "buy now",
                "pass",
                Blocked: true,
                Reason: "global_blocklist"),
            CancellationToken.None);

        Assert.Equal(IngestResult.Blocked, result);
        Assert.Empty(repository.Messages);
        var blocked = Assert.Single(repository.BlockedMessages);
        Assert.Equal("global_blocklist", blocked.Reason);
        Assert.Equal(AliasId, blocked.AliasId);
        Assert.Equal("buy now", blocked.Subject);
    }

    [Fact]
    public async Task BlockedDecision_TruncatesOverlongReason()
    {
        var repository = new RecordingActivityRepository();
        var service = new IngestService(repository, TimeProvider.System);

        await service.IngestAsync(
            new IngestRequest(
                "shop.abcd@postern.local",
                "promo@spamco.ru",
                "Promo <promo@spamco.ru>",
                "buy now",
                "pass",
                Blocked: true,
                Reason: new string('x', 50)),
            CancellationToken.None);

        Assert.Equal(32, Assert.Single(repository.BlockedMessages).Reason.Length);
    }

    [Fact]
    public async Task BlockedDecision_DefaultsReasonWhenMissing()
    {
        var repository = new RecordingActivityRepository();
        var service = new IngestService(repository, TimeProvider.System);

        await service.IngestAsync(
            new IngestRequest(
                "shop.abcd@postern.local",
                "promo@spamco.ru",
                "Promo <promo@spamco.ru>",
                "buy now",
                "pass",
                Blocked: true),
            CancellationToken.None);

        Assert.Equal("blocked", Assert.Single(repository.BlockedMessages).Reason);
    }

    [Fact]
    public async Task BlockedDecision_ForUnknownAlias_ReturnsUnknownAliasAndRecordsNothing()
    {
        var repository = new RecordingActivityRepository { Alias = null };
        var service = new IngestService(repository, TimeProvider.System);

        var result = await service.IngestAsync(
            new IngestRequest(
                "missing.abcd@postern.local",
                "promo@spamco.ru",
                "Promo <promo@spamco.ru>",
                "buy now",
                "pass",
                Blocked: true,
                Reason: "global_blocklist"),
            CancellationToken.None);

        Assert.Equal(IngestResult.UnknownAlias, result);
        Assert.Empty(repository.BlockedMessages);
        Assert.Empty(repository.Messages);
    }

    [Fact]
    public async Task BlockedFlagOff_StillAppliesStatusRules()
    {
        var repository = new RecordingActivityRepository
        {
            Alias = new Alias
            {
                Id = AliasId,
                UserId = Guid.NewGuid(),
                Label = "shop",
                RandomSuffix = "abcd",
                FullAddress = "shop.abcd@postern.local",
                FullAddressHash = "hash",
                Category = "personal",
                Status = AliasStatus.Disabled,
                CreatedAt = DateTimeOffset.UtcNow
            }
        };
        var service = new IngestService(repository, TimeProvider.System);

        var result = await service.IngestAsync(
            "shop.abcd@postern.local",
            "promo@spamco.ru",
            "Promo <promo@spamco.ru>",
            "buy now",
            "pass",
            CancellationToken.None);

        Assert.Equal(IngestResult.Blocked, result);
        Assert.Equal("disabled", Assert.Single(repository.BlockedMessages).Reason);
    }

    private sealed class RecordingActivityRepository : IActivityRepository
    {
        public Alias? Alias { get; init; } = new()
        {
            Id = AliasId,
            UserId = Guid.NewGuid(),
            Label = "shop",
            RandomSuffix = "abcd",
            FullAddress = "shop.abcd@postern.local",
            FullAddressHash = "hash",
            Category = "personal",
            Status = AliasStatus.Active,
            CreatedAt = DateTimeOffset.UtcNow
        };

        public List<Message> Messages { get; } = [];

        public List<BlockedMessage> BlockedMessages { get; } = [];

        public Task<Alias?> FindAliasForIngestAsync(string fullAddressHash, CancellationToken cancellationToken) =>
            Task.FromResult(Alias);

        public Task<Alias?> FindAliasForIngestWithExpectedSendersAsync(
            string fullAddressHash,
            CancellationToken cancellationToken) =>
            Task.FromResult(Alias);

        public Task<bool> MessageIdExistsAsync(Guid aliasId, string messageId, CancellationToken cancellationToken) =>
            Task.FromResult(Messages.Any(message => message.AliasId == aliasId && message.MessageId == messageId));

        public Task<Message> RecordMessageAsync(Message message, CancellationToken cancellationToken)
        {
            Messages.Add(message);
            return Task.FromResult(message);
        }

        public Task<BlockedMessage> RecordBlockedMessageAsync(
            BlockedMessage blockedMessage,
            CancellationToken cancellationToken)
        {
            BlockedMessages.Add(blockedMessage);
            return Task.FromResult(blockedMessage);
        }

        public Task AddExpectedAddressSenderAsync(
            Guid aliasId,
            string senderAddress,
            string senderEtld1,
            DateTimeOffset createdAt,
            CancellationToken cancellationToken) =>
            Task.CompletedTask;

        public Task<IReadOnlyDictionary<Guid, int>> CountForwardedMessagesPerUserAsync(
            DateTimeOffset receivedAfter,
            CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyDictionary<Guid, int>>(new Dictionary<Guid, int>());

        public Task<IReadOnlyList<Message>> ListMessagesAsync(
            Guid aliasId,
            DateTimeOffset receivedAfter,
            DateTimeOffset? beforeReceivedAt,
            Guid? beforeId,
            int limit,
            CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<Message>>(Array.Empty<Message>());

        public Task<IReadOnlyList<BlockedMessage>> ListBlockedMessagesForUserAsync(
            Guid userId,
            Guid? aliasId,
            DateTimeOffset receivedAfter,
            DateTimeOffset? beforeReceivedAt,
            Guid? beforeId,
            int limit,
            CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<BlockedMessage>>(Array.Empty<BlockedMessage>());
    }
}
