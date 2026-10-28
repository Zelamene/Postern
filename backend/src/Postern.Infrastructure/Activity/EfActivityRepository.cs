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

    public async Task<Alias?> FindAliasForIngestWithExpectedSendersAsync(string fullAddressHash, CancellationToken cancellationToken) =>
        await dbContext.Aliases
            .Include(alias => alias.ExpectedSenders)
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

    public async Task AddExpectedSenderAsync(Guid aliasId, string senderEtld1, DateTimeOffset createdAt, CancellationToken cancellationToken)
    {
        var exists = await dbContext.ExpectedSenders.AnyAsync(sender => sender.AliasId == aliasId && sender.SenderEtld1 == senderEtld1, cancellationToken);
        if (exists)
        {
            return;
        }

        var entry = new ExpectedSender
        {
            Id = Guid.NewGuid(),
            AliasId = aliasId,
            SenderEtld1 = senderEtld1,
            CreatedAt = createdAt
        };

        dbContext.ExpectedSenders.Add(entry);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<int> CountForwardedMessagesLast24HoursAsync(CancellationToken cancellationToken)
    {
        var cutoff = DateTimeOffset.UtcNow.AddHours(-24);
        return await dbContext.Messages
            .CountAsync(message => message.ReceivedAt >= cutoff, cancellationToken);
    }
}
