using Microsoft.EntityFrameworkCore;
using Postern.Application.Notifications;
using Postern.Domain.Notifications;
using Postern.Infrastructure.Persistence;

namespace Postern.Infrastructure.Notifications;

public sealed class EfNotificationRepository(PosternDbContext dbContext) : INotificationRepository
{
    public async Task AddAsync(Notification notification, CancellationToken cancellationToken)
    {
        dbContext.Notifications.Add(notification);
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<Notification>> ListAsync(
        NotificationAudience audience,
        Guid? recipientUserId,
        int limit,
        CancellationToken cancellationToken) =>
        await dbContext.Notifications
            .AsNoTracking()
            .Where(notification =>
                notification.Audience == audience
                && notification.RecipientUserId == recipientUserId)
            .OrderByDescending(notification => notification.CreatedAt)
            .ThenByDescending(notification => notification.Id)
            .Take(limit)
            .ToListAsync(cancellationToken);

    public Task<int> CountUnreadAsync(
        NotificationAudience audience,
        Guid? recipientUserId,
        CancellationToken cancellationToken) =>
        dbContext.Notifications.CountAsync(
            notification =>
                notification.Audience == audience
                && notification.RecipientUserId == recipientUserId
                && notification.ReadAt == null,
            cancellationToken);

    public async Task<bool> MarkReadAsync(
        NotificationAudience audience,
        Guid? recipientUserId,
        Guid notificationId,
        DateTimeOffset readAt,
        CancellationToken cancellationToken)
    {
        var updated = await dbContext.Notifications
            .Where(notification =>
                notification.Id == notificationId
                && notification.Audience == audience
                && notification.RecipientUserId == recipientUserId
                && notification.ReadAt == null)
            .ExecuteUpdateAsync(
                setters => setters.SetProperty(notification => notification.ReadAt, readAt),
                cancellationToken);

        return updated == 1;
    }

    public Task<int> MarkAllReadAsync(
        NotificationAudience audience,
        Guid? recipientUserId,
        DateTimeOffset readAt,
        CancellationToken cancellationToken) =>
        dbContext.Notifications
            .Where(notification =>
                notification.Audience == audience
                && notification.RecipientUserId == recipientUserId
                && notification.ReadAt == null)
            .ExecuteUpdateAsync(
                setters => setters.SetProperty(notification => notification.ReadAt, readAt),
                cancellationToken);
}
