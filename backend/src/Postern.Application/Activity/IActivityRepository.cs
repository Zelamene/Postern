using Postern.Domain.Activity;
using Postern.Domain.Aliases;

namespace Postern.Application.Activity;

public interface IActivityRepository
{
    Task<Alias?> FindAliasForIngestAsync(string fullAddressHash, CancellationToken cancellationToken);

    Task<Alias?> FindAliasForIngestWithExpectedSendersAsync(string fullAddressHash, CancellationToken cancellationToken);

    Task<Message> RecordMessageAsync(Message message, CancellationToken cancellationToken);

    Task<BlockedMessage> RecordBlockedMessageAsync(BlockedMessage blockedMessage, CancellationToken cancellationToken);

    Task AddExpectedSenderAsync(Guid aliasId, string senderEtld1, DateTimeOffset createdAt, CancellationToken cancellationToken);

    Task<int> CountForwardedMessagesLast24HoursAsync(CancellationToken cancellationToken);

    Task<IReadOnlyList<Message>> ListMessagesAsync(
        Guid aliasId,
        DateTimeOffset receivedAfter,
        DateTimeOffset? beforeReceivedAt,
        Guid? beforeId,
        int limit,
        CancellationToken cancellationToken);


    Task<IReadOnlyList<BlockedMessage>> ListBlockedMessagesForUserAsync(
        Guid userId,
        Guid? aliasId,
        DateTimeOffset receivedAfter,
        DateTimeOffset? beforeReceivedAt,
        Guid? beforeId,
        int limit,
        CancellationToken cancellationToken);
}
