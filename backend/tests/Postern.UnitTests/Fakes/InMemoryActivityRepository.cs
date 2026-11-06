using Postern.Application.Activity;
using Postern.Domain.Activity;
using Postern.Domain.Aliases;

namespace Postern.UnitTests.Fakes;

public sealed class InMemoryActivityRepository : IActivityRepository
{
    private readonly List<Alias> _aliases = [];
    public List<Message> Messages { get; } = [];
    public List<BlockedMessage> BlockedMessages { get; } = [];
    public List<(Guid AliasId, string SenderEtld1, DateTimeOffset CreatedAt)> AddedExpectedSenders { get; } = [];

    public void AddAlias(Alias alias) => _aliases.Add(alias);

    public Task<Alias?> FindAliasForIngestAsync(string fullAddressHash, CancellationToken cancellationToken) =>
        Task.FromResult(_aliases.SingleOrDefault(a => a.FullAddressHash == fullAddressHash));

    public Task<Alias?> FindAliasForIngestWithExpectedSendersAsync(string fullAddressHash, CancellationToken cancellationToken) =>
        Task.FromResult(_aliases.SingleOrDefault(a => a.FullAddressHash == fullAddressHash));

    public Task<bool> MessageIdExistsAsync(Guid aliasId, string messageId, CancellationToken cancellationToken) =>
        Task.FromResult(Messages.Any(message => message.AliasId == aliasId && message.MessageId == messageId));

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
        AddedExpectedSenders.Add((aliasId, senderEtld1, createdAt));
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
        CancellationToken cancellationToken)
    {
        var query = Messages.Where(m => m.AliasId == aliasId && m.ReceivedAt >= receivedAfter);
        if (beforeReceivedAt is not null && beforeId is not null)
        {
            query = query.Where(m => m.ReceivedAt < beforeReceivedAt || (m.ReceivedAt == beforeReceivedAt && m.Id.CompareTo(beforeId.Value) < 0));
        }
        return Task.FromResult<IReadOnlyList<Message>>(query
            .OrderByDescending(m => m.ReceivedAt).ThenByDescending(m => m.Id).Take(limit).ToList());
    }

    public Task<IReadOnlyList<BlockedMessage>> ListBlockedMessagesForUserAsync(
        Guid userId,
        Guid? aliasId,
        DateTimeOffset receivedAfter,
        DateTimeOffset? beforeReceivedAt,
        Guid? beforeId,
        int limit,
        CancellationToken cancellationToken)
    {
        var ownedAliasIds = _aliases.Where(a => a.UserId == userId).Select(a => a.Id).ToHashSet();
        var query = BlockedMessages.Where(m => ownedAliasIds.Contains(m.AliasId) && m.ReceivedAt >= receivedAfter);
        if (aliasId is not null) query = query.Where(m => m.AliasId == aliasId);
        if (beforeReceivedAt is not null && beforeId is not null)
        {
            query = query.Where(m => m.ReceivedAt < beforeReceivedAt || (m.ReceivedAt == beforeReceivedAt && m.Id.CompareTo(beforeId.Value) < 0));
        }
        return Task.FromResult<IReadOnlyList<BlockedMessage>>(query
            .OrderByDescending(m => m.ReceivedAt).ThenByDescending(m => m.Id).Take(limit).ToList());
    }
}
