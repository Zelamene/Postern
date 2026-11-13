using Postern.Application.Activity;
using Postern.Application.Aliases;
using Postern.Domain.Activity;
using Postern.Domain.Aliases;
using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public sealed class ExpectedSenderScopeTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 13, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task FirstContactAtPublicProviderTrustsOnlyThatAddress()
    {
        var repository = new ScopeActivityRepository();
        var alias = repository.AddAlias();
        var service = new IngestService(repository, new FixedTimeProvider(Now));

        var first = await service.IngestAsync(
            alias.FullAddress!,
            "alice@gmail.com",
            "Alice <alice@gmail.com>",
            "Hello",
            "pass",
            CancellationToken.None);
        var second = await service.IngestAsync(
            alias.FullAddress!,
            "bob@gmail.com",
            "Bob <bob@gmail.com>",
            "Hello again",
            "pass",
            CancellationToken.None);

        Assert.Equal(IngestResult.Accepted, first);
        Assert.Equal(IngestResult.Accepted, second);
        var trusted = Assert.Single(repository.AddedExpectedSenders);
        Assert.Equal("alice@gmail.com", trusted.SenderAddress);
        Assert.Equal("gmail.com", trusted.SenderEtld1);
        Assert.False(trusted.TrustWholeDomain);
        Assert.Equal(2, repository.Messages.Count);
        Assert.False(repository.Messages[0].IsFlagged);
        Assert.True(repository.Messages[1].IsFlagged);
        Assert.Equal("unexpected_pass", repository.Messages[1].FlagReason);
    }

    [Fact]
    public async Task FirstContactAtCorporateDomainDoesNotTrustOtherAddresses()
    {
        var repository = new ScopeActivityRepository();
        var alias = repository.AddAlias();
        var service = new IngestService(repository, new FixedTimeProvider(Now));

        await service.IngestAsync(
            alias.FullAddress!,
            "orders@netflix.com",
            "Orders <orders@netflix.com>",
            "Receipt",
            "pass",
            CancellationToken.None);
        await service.IngestAsync(
            alias.FullAddress!,
            "billing@netflix.com",
            "Billing <billing@netflix.com>",
            "Invoice",
            "pass",
            CancellationToken.None);

        Assert.Equal("orders@netflix.com", Assert.Single(repository.AddedExpectedSenders).SenderAddress);
        Assert.False(repository.Messages[0].IsFlagged);
        Assert.True(repository.Messages[1].IsFlagged);
    }

    [Fact]
    public async Task WholeDomainTrustAcceptsAnyAddressAtThatDomain()
    {
        var repository = new ScopeActivityRepository();
        var alias = repository.AddAlias();
        repository.SeedExpectedSender(alias.Id, senderAddress: null, senderEtld1: "shop.example", trustWholeDomain: true);
        var service = new IngestService(repository, new FixedTimeProvider(Now));

        await service.IngestAsync(
            alias.FullAddress!,
            "someone@checkout.shop.example",
            "Someone <someone@checkout.shop.example>",
            "Order",
            "pass",
            CancellationToken.None);

        Assert.False(Assert.Single(repository.Messages).IsFlagged);
        Assert.Empty(repository.AddedExpectedSenders);
    }

    [Fact]
    public async Task AddressTrustIgnoresDisplayNameAndCase()
    {
        var repository = new ScopeActivityRepository();
        var alias = repository.AddAlias();
        repository.SeedExpectedSender(alias.Id, "jane@sub.mail.co.uk", "mail.co.uk", trustWholeDomain: false);
        var service = new IngestService(repository, new FixedTimeProvider(Now));

        await service.IngestAsync(
            alias.FullAddress!,
            "\"Doe, Jane\" <Jane@Sub.Mail.co.uk>",
            "\"Doe, Jane\" <Jane@Sub.Mail.co.uk>",
            "Hi",
            "pass",
            CancellationToken.None);

        Assert.False(Assert.Single(repository.Messages).IsFlagged);
    }

    [Fact]
    public async Task MarkExpectedAddressAddsAddressScopedRowOnly()
    {
        var repository = new InMemoryAliasRepository();
        var alias = NewAlias();
        repository.Seed(alias);
        var service = TestAliasService.Create(repository, new FixedTimeProvider(Now), new InMemoryKvWriter());

        var marked = await service.MarkExpectedAddressAsync(alias.UserId!.Value, alias.Id, " Alice@Gmail.com ", CancellationToken.None);
        var other = await service.MarkExpectedAddressAsync(alias.UserId!.Value, alias.Id, "bob@gmail.com", CancellationToken.None);

        Assert.True(marked);
        Assert.True(other);
        Assert.Collection(
            repository.ExpectedSenders,
            sender =>
            {
                Assert.Equal("alice@gmail.com", sender.SenderAddress);
                Assert.Equal("gmail.com", sender.SenderEtld1);
                Assert.False(sender.TrustWholeDomain);
            },
            sender => Assert.Equal("bob@gmail.com", sender.SenderAddress));
    }

    [Fact]
    public async Task MarkExpectedAddressRejectsInputWithoutAddress()
    {
        var repository = new InMemoryAliasRepository();
        var alias = NewAlias();
        repository.Seed(alias);
        var service = TestAliasService.Create(repository, new FixedTimeProvider(Now), new InMemoryKvWriter());

        Assert.False(await service.MarkExpectedAddressAsync(alias.UserId!.Value, alias.Id, "gmail.com", CancellationToken.None));
        Assert.False(await service.MarkExpectedAddressAsync(alias.UserId!.Value, alias.Id, " ", CancellationToken.None));
        Assert.Empty(repository.ExpectedSenders);
    }

    private static Alias NewAlias()
    {
        var address = $"scope-{Guid.NewGuid():N}"[..22] + "@postern.local";
        return new Alias
        {
            Id = Guid.NewGuid(),
            UserId = Guid.NewGuid(),
            Label = "scope",
            RandomSuffix = "ab12cd34",
            FullAddress = address,
            FullAddressHash = AliasService.HashAddress(address),
            Category = "personal",
            Status = AliasStatus.Active,
            CreatedAt = Now
        };
    }

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    private sealed class ScopeActivityRepository : IActivityRepository
    {
        private readonly List<Alias> _aliases = [];
        private readonly List<ExpectedSender> _expectedSenders = [];

        public List<Message> Messages { get; } = [];

        public List<ExpectedSender> AddedExpectedSenders { get; } = [];

        public Alias AddAlias()
        {
            var alias = NewAlias();
            _aliases.Add(alias);
            return alias;
        }

        public void SeedExpectedSender(Guid aliasId, string? senderAddress, string senderEtld1, bool trustWholeDomain)
        {
            _expectedSenders.Add(new ExpectedSender
            {
                Id = Guid.NewGuid(),
                AliasId = aliasId,
                SenderAddress = senderAddress,
                SenderEtld1 = senderEtld1,
                TrustWholeDomain = trustWholeDomain,
                CreatedAt = Now
            });
        }

        public Task<Alias?> FindAliasForIngestAsync(string fullAddressHash, CancellationToken cancellationToken) =>
            Task.FromResult(_aliases.SingleOrDefault(alias => alias.FullAddressHash == fullAddressHash));

        public Task<Alias?> FindAliasForIngestWithExpectedSendersAsync(string fullAddressHash, CancellationToken cancellationToken)
        {
            var alias = _aliases.SingleOrDefault(item => item.FullAddressHash == fullAddressHash);
            if (alias is not null)
            {
                alias.ExpectedSenders.Clear();
                foreach (var sender in _expectedSenders.Where(sender => sender.AliasId == alias.Id))
                {
                    alias.ExpectedSenders.Add(sender);
                }
            }

            return Task.FromResult(alias);
        }

        public Task<bool> MessageIdExistsAsync(Guid aliasId, string messageId, CancellationToken cancellationToken) =>
            Task.FromResult(Messages.Any(message => message.AliasId == aliasId && message.MessageId == messageId));

        public Task<Message> RecordMessageAsync(Message message, CancellationToken cancellationToken)
        {
            Messages.Add(message);
            return Task.FromResult(message);
        }

        public Task<BlockedMessage> RecordBlockedMessageAsync(BlockedMessage blockedMessage, CancellationToken cancellationToken) =>
            Task.FromResult(blockedMessage);

        public Task AddExpectedAddressSenderAsync(
            Guid aliasId,
            string senderAddress,
            string senderEtld1,
            DateTimeOffset createdAt,
            CancellationToken cancellationToken)
        {
            var sender = new ExpectedSender
            {
                Id = Guid.NewGuid(),
                AliasId = aliasId,
                SenderAddress = senderAddress,
                SenderEtld1 = senderEtld1,
                TrustWholeDomain = false,
                CreatedAt = createdAt
            };
            _expectedSenders.Add(sender);
            AddedExpectedSenders.Add(sender);
            return Task.CompletedTask;
        }

        public Task<IReadOnlyDictionary<Guid, int>> CountForwardedMessagesPerUserAsync(DateTimeOffset receivedAfter, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyDictionary<Guid, int>>(new Dictionary<Guid, int>());

        public Task<IReadOnlyList<Message>> ListMessagesAsync(
            Guid aliasId,
            DateTimeOffset receivedAfter,
            DateTimeOffset? beforeReceivedAt,
            Guid? beforeId,
            int limit,
            CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<Message>>(Messages
                .Where(message => message.AliasId == aliasId && message.ReceivedAt >= receivedAfter)
                .OrderByDescending(message => message.ReceivedAt)
                .ThenByDescending(message => message.Id)
                .Take(limit)
                .ToList());

        public Task<IReadOnlyList<BlockedMessage>> ListBlockedMessagesForUserAsync(
            Guid userId,
            Guid? aliasId,
            DateTimeOffset receivedAfter,
            DateTimeOffset? beforeReceivedAt,
            Guid? beforeId,
            int limit,
            CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<BlockedMessage>>([]);
    }
}
