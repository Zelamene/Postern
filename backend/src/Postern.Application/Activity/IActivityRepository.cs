using Postern.Domain.Activity;
using Postern.Domain.Aliases;

namespace Postern.Application.Activity;

public interface IActivityRepository
{
    Task<Alias?> FindAliasForIngestAsync(string fullAddressHash, CancellationToken cancellationToken);

    Task<Alias?> FindAliasForIngestWithExpectedSendersAsync(string fullAddressHash, CancellationToken cancellationToken);

    Task<bool> MessageIdExistsAsync(Guid aliasId, string messageId, CancellationToken cancellationToken);

    Task<Message> RecordMessageAsync(Message message, CancellationToken cancellationToken);

    Task<BlockedMessage> RecordBlockedMessageAsync(BlockedMessage blockedMessage, CancellationToken cancellationToken);

    Task AddExpectedAddressSenderAsync(
        Guid aliasId,
        string senderAddress,
        string senderEtld1,
        DateTimeOffset createdAt,
        CancellationToken cancellationToken);

    /// <summary>
    /// Forwarded message count per owning user since <paramref name="receivedAfter"/>.
    /// Tombstoned aliases have no owner and are therefore excluded.
    /// </summary>
    Task<IReadOnlyDictionary<Guid, int>> CountForwardedMessagesPerUserAsync(
        DateTimeOffset receivedAfter,
        CancellationToken cancellationToken);

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
