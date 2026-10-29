using Postern.Application.Activity;
using Postern.Domain.Activity;
using Postern.Domain.Aliases;

namespace Postern.UnitTests;

public sealed class IngestFlagLogicTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 29, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task ExpectedSenderWithPassIsStoredUnflagged()
    {
        var repository = new FlagTestActivityRepository();
        var alias = FlagTestActivityRepository.CreateAlias(AliasStatus.Active, ["example.com"]);
        repository.AddAlias(alias);
        var service = new IngestService(repository, new FixedTimeProvider(Now));

        var result = await service.IngestAsync(
            alias.FullAddress!,
            "sender@example.com",
            "Sender <sender@example.com>",
            "Hello",
            "pass",
            CancellationToken.None);

        Assert.Equal(IngestResult.Accepted, result);
        var message = Assert.Single(repository.Messages);
        Assert.False(message.IsFlagged);
        Assert.Null(message.FlagReason);
    }

    [Fact]
    public async Task UnexpectedSenderWithPassIsFlaggedAsUnexpectedPass()
    {
        var repository = new FlagTestActivityRepository();
        var alias = FlagTestActivityRepository.CreateAlias(AliasStatus.Active, ["example.com"]);
        repository.AddAlias(alias);
        var service = new IngestService(repository, new FixedTimeProvider(Now));

        var result = await service.IngestAsync(
            alias.FullAddress!,
            "attacker@evil.test",
            "Attacker <attacker@evil.test>",
            "Hello",
            "pass",
            CancellationToken.None);

        Assert.Equal(IngestResult.Accepted, result);
        var message = Assert.Single(repository.Messages);
        Assert.True(message.IsFlagged);
        Assert.Equal("unexpected_pass", message.FlagReason);
    }

    [Fact]
    public async Task UnexpectedSenderWithNoneIsFlaggedAsUnexpectedNone()
    {
        var repository = new FlagTestActivityRepository();
        var alias = FlagTestActivityRepository.CreateAlias(AliasStatus.Active, ["example.com"]);
        repository.AddAlias(alias);
        var service = new IngestService(repository, new FixedTimeProvider(Now));

        var result = await service.IngestAsync(
            alias.FullAddress!,
            "stranger@other.test",
            "Stranger <stranger@other.test>",
            "Hello",
            "none",
            CancellationToken.None);

        Assert.Equal(IngestResult.Accepted, result);
        var message = Assert.Single(repository.Messages);
        Assert.True(message.IsFlagged);
        Assert.Equal("unexpected_none", message.FlagReason);
    }

    [Fact]
    public async Task FailedAuthenticationIsFlaggedAsFail()
    {
        var repository = new FlagTestActivityRepository();
        var alias = FlagTestActivityRepository.CreateAlias(AliasStatus.Active, []);
        repository.AddAlias(alias);
        var service = new IngestService(repository, new FixedTimeProvider(Now));

        var result = await service.IngestAsync(
            alias.FullAddress!,
            "spoofed@example.com",
            "Spoofed <spoofed@example.com>",
            "Hello",
            "fail",
            CancellationToken.None);

        Assert.Equal(IngestResult.Accepted, result);
        var message = Assert.Single(repository.Messages);
        Assert.True(message.IsFlagged);
        Assert.Equal("fail", message.FlagReason);
    }

    [Fact]
    public async Task UnknownAuthenticationResultOnUnexpectedSenderIsFlaggedAsUnknown()
    {
        var repository = new FlagTestActivityRepository();
        var alias = FlagTestActivityRepository.CreateAlias(AliasStatus.Active, ["example.com"]);
        repository.AddAlias(alias);
        var service = new IngestService(repository, new FixedTimeProvider(Now));

        var result = await service.IngestAsync(
            alias.FullAddress!,
            "stranger@other.test",
            "Stranger <stranger@other.test>",
            "Hello",
            "garbage-header-value",
            CancellationToken.None);

        Assert.Equal(IngestResult.Accepted, result);
        var message = Assert.Single(repository.Messages);
        Assert.Equal("unknown", message.AuthenticationResult);
        Assert.True(message.IsFlagged);
        Assert.Equal("unknown", message.FlagReason);
    }

    [Fact]
    public async Task FirstDmarcPassOnAliasWithoutExpectedSendersBecomesExpectedAndIsNotFlagged()
    {
        var repository = new FlagTestActivityRepository();
        var alias = FlagTestActivityRepository.CreateAlias(AliasStatus.Active, []);
        repository.AddAlias(alias);
        var service = new IngestService(repository, new FixedTimeProvider(Now));

        var result = await service.IngestAsync(
            alias.FullAddress!,
            "news@newsletter.test",
            "News <news@newsletter.test>",
            "Hello",
            "pass",
            CancellationToken.None);

        Assert.Equal(IngestResult.Accepted, result);
        var message = Assert.Single(repository.Messages);
        Assert.False(message.IsFlagged);
        Assert.Null(message.FlagReason);
        Assert.Equal("newsletter.test", Assert.Single(repository.AddedExpectedSenders).SenderEtld1);
        Assert.Equal(alias.Id, repository.AddedExpectedSenders[0].AliasId);
    }

    [Fact]
    public async Task SubjectIsDecodedAndTruncatedToSixtyCharacters()
    {
        var repository = new FlagTestActivityRepository();
        var alias = FlagTestActivityRepository.CreateAlias(AliasStatus.Active, ["example.com"]);
        repository.AddAlias(alias);
        var service = new IngestService(repository, new FixedTimeProvider(Now));
        var encoded = "=?utf-8?B?" + Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes("Café invite")) + "?=";

        var result = await service.IngestAsync(
            alias.FullAddress!,
            "sender@example.com",
            "Sender <sender@example.com>",
            encoded,
            "pass",
            CancellationToken.None);

        Assert.Equal(IngestResult.Accepted, result);
        var message = Assert.Single(repository.Messages);
        Assert.Equal("Café invite", message.Subject);
    }

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    private sealed class FlagTestActivityRepository : IActivityRepository
    {
        private readonly List<Alias> _aliases = [];
        private readonly List<ExpectedSender> _expectedSenders = [];

        public List<Message> Messages { get; } = [];
        public List<BlockedMessage> BlockedMessages { get; } = [];
        public List<ExpectedSender> AddedExpectedSenders { get; } = [];

        public void AddAlias(Alias alias)
        {
            _expectedSenders.AddRange(alias.ExpectedSenders);
            _aliases.Add(alias);
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

        public Task AddExpectedSenderAsync(Guid aliasId, string senderEtld1, DateTimeOffset createdAt, CancellationToken cancellationToken)
        {
            var sender = new ExpectedSender
            {
                Id = Guid.NewGuid(),
                AliasId = aliasId,
                SenderEtld1 = senderEtld1,
                CreatedAt = createdAt
            };
            _expectedSenders.Add(sender);
            AddedExpectedSenders.Add(sender);
            return Task.CompletedTask;
        }

        public Task<int> CountForwardedMessagesLast24HoursAsync(CancellationToken cancellationToken) =>
            Task.FromResult(Messages.Count);

        public Task<IReadOnlyList<Message>> ListMessagesAsync(Guid aliasId, DateTimeOffset receivedAfter, DateTimeOffset? beforeReceivedAt, Guid? beforeId, int limit, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<Message>>(Messages
                .Where(message => message.AliasId == aliasId && message.ReceivedAt >= receivedAfter)
                .OrderByDescending(message => message.ReceivedAt)
                .ThenByDescending(message => message.Id)
                .Take(limit)
                .ToList());

        public Task<IReadOnlyList<BlockedMessage>> ListBlockedMessagesForUserAsync(Guid userId, Guid? aliasId, DateTimeOffset receivedAfter, DateTimeOffset? beforeReceivedAt, Guid? beforeId, int limit, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<BlockedMessage>>(BlockedMessages
                .Where(message => message.ReceivedAt >= receivedAfter)
                .Where(message => aliasId is null || message.AliasId == aliasId)
                .OrderByDescending(message => message.ReceivedAt)
                .ThenByDescending(message => message.Id)
                .Take(limit)
                .ToList());

        public static Alias CreateAlias(AliasStatus status, string[] expectedSenderDomains)
        {
            var address = $"flag-{Guid.NewGuid():N}"[..20] + "@postern.local";
            var alias = new Alias
            {
                Id = Guid.NewGuid(),
                UserId = Guid.NewGuid(),
                Label = "flag",
                RandomSuffix = "abcd1234",
                FullAddress = address,
                FullAddressHash = Application.Aliases.AliasService.HashAddress(address),
                Category = "personal",
                Status = status,
                CreatedAt = Now
            };

            foreach (var domain in expectedSenderDomains)
            {
                alias.ExpectedSenders.Add(new ExpectedSender
                {
                    Id = Guid.NewGuid(),
                    AliasId = alias.Id,
                    SenderEtld1 = domain,
                    CreatedAt = Now
                });
            }

            return alias;
        }
    }
}
