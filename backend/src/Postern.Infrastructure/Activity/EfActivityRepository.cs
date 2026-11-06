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

    public Task<bool> MessageIdExistsAsync(Guid aliasId, string messageId, CancellationToken cancellationToken) =>
        dbContext.Messages.AnyAsync(
            message => message.AliasId == aliasId && message.MessageId == messageId,
            cancellationToken);

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

    public async Task<IReadOnlyDictionary<Guid, int>> CountForwardedMessagesPerUserAsync(
        DateTimeOffset receivedAfter,
        CancellationToken cancellationToken)
    {
        var counts = await dbContext.Messages
            .Where(message => message.ReceivedAt >= receivedAfter && message.Alias.UserId != null)
            .GroupBy(message => message.Alias.UserId!.Value)
            .Select(group => new { UserId = group.Key, Count = group.Count() })
            .ToListAsync(cancellationToken);

        return counts.ToDictionary(item => item.UserId, item => item.Count);
    }

    public async Task<IReadOnlyList<Message>> ListMessagesAsync(
        Guid aliasId,
        DateTimeOffset receivedAfter,
        DateTimeOffset? beforeReceivedAt,
        Guid? beforeId,
        int limit,
        CancellationToken cancellationToken)
    {
        var query = dbContext.Messages
            .AsNoTracking()
            .Where(message => message.AliasId == aliasId && message.ReceivedAt >= receivedAfter);

        if (beforeReceivedAt is { } cursorTimestamp && beforeId is { } cursorId)
        {
            var cursorIdText = CursorIdText(cursorId);
            query = query.Where(message =>
                message.ReceivedAt < cursorTimestamp
                || (message.ReceivedAt == cursorTimestamp
                    && string.Compare(message.Id.ToString(), cursorIdText) < 0));
        }

        return await query
            .OrderByDescending(message => message.ReceivedAt)
            .ThenByDescending(message => message.Id)
            .Take(limit)
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<BlockedMessage>> ListBlockedMessagesForUserAsync(
        Guid userId,
        Guid? aliasId,
        DateTimeOffset receivedAfter,
        DateTimeOffset? beforeReceivedAt,
        Guid? beforeId,
        int limit,
        CancellationToken cancellationToken)
    {
        var query = dbContext.BlockedMessages
            .AsNoTracking()
            .Where(message =>
                message.Alias.UserId == userId && message.ReceivedAt >= receivedAfter);

        if (aliasId is { } scopedAliasId)
        {
            query = query.Where(message => message.AliasId == scopedAliasId);
        }

        if (beforeReceivedAt is { } cursorTimestamp && beforeId is { } cursorId)
        {
            var cursorIdText = CursorIdText(cursorId);
            query = query.Where(message =>
                message.ReceivedAt < cursorTimestamp
                || (message.ReceivedAt == cursorTimestamp
                    && string.Compare(message.Id.ToString(), cursorIdText) < 0));
        }

        return await query
            .OrderByDescending(message => message.ReceivedAt)
            .ThenByDescending(message => message.Id)
            .Take(limit)
            .ToListAsync(cancellationToken);
    }

    /// <summary>
    /// Must use the same canonical rendering EF sends for <c>message.Id.ToString()</c>, otherwise
    /// the cursor row compares as "before itself" and repeats on the next page.
    /// </summary>
    private static string CursorIdText(Guid cursorId) => cursorId.ToString();
}
