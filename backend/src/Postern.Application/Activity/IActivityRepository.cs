using Postern.Domain.Activity;
using Postern.Domain.Aliases;

namespace Postern.Application.Activity;

public interface IActivityRepository
{
    Task<Alias?> FindAliasForIngestAsync(string fullAddressHash, CancellationToken cancellationToken);

    Task<Alias?> FindAliasForIngestWithExpectedSendersAsync(string fullAddressHash, CancellationToken cancellationToken);

    Task<bool> MessageIdExistsAsync(Guid aliasId, string messageId, CancellationToken cancellationToken);

    Task<Message> RecordMessageAsync(Message message, CancellationToken cancellationToken);

    /// <summary>
    /// Records a message, returning false when another delivery with the same
    /// Message-ID already exists for the alias. The check performed before this
    /// call cannot see a concurrent delivery, so the write itself must tolerate it.
    /// </summary>
    async Task<bool> TryRecordMessageAsync(Message message, CancellationToken cancellationToken)
    {
        await RecordMessageAsync(message, cancellationToken);
        return true;
    }

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
