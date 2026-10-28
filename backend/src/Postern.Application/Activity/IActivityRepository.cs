using Postern.Domain.Activity;

namespace Postern.Application.Activity;

public interface IActivityRepository
{
    Task<Postern.Domain.Aliases.Alias?> FindAliasForIngestAsync(string fullAddressHash, CancellationToken cancellationToken);

    Task<Message> RecordMessageAsync(Message message, CancellationToken cancellationToken);

    Task<BlockedMessage> RecordBlockedMessageAsync(BlockedMessage blockedMessage, CancellationToken cancellationToken);
}
