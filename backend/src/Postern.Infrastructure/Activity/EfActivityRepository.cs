using Microsoft.EntityFrameworkCore;
using Postern.Application.Activity;
using Postern.Domain.Activity;
using Postern.Domain.Aliases;
using Postern.Infrastructure.Persistence;

namespace Postern.Infrastructure.Activity;

public sealed class EfActivityRepository(PosternDbContext dbContext) : IActivityRepository
{
    public async Task<Alias?> FindAliasForIngestAsync(string fullAddressHash, CancellationToken cancellationToken) =>
        await dbContext.Aliases
            .SingleOrDefaultAsync(alias => alias.FullAddressHash == fullAddressHash, cancellationToken);

    public async Task<Message> RecordMessageAsync(Message message, CancellationToken cancellationToken)
    {
        dbContext.Messages.Add(message);
        await dbContext.SaveChangesAsync(cancellationToken);
        return message;
    }

    public async Task<BlockedMessage> RecordBlockedMessageAsync(BlockedMessage blockedMessage, CancellationToken cancellationToken)
    {
        dbContext.BlockedMessages.Add(blockedMessage);
        await dbContext.SaveChangesAsync(cancellationToken);
        return blockedMessage;
    }
}
