using Postern.Domain.Notifications;

namespace Postern.Application.Notifications;

public interface INotificationRepository
{
    Task AddAsync(Notification notification, CancellationToken cancellationToken);

    Task<IReadOnlyList<Notification>> ListAsync(
        NotificationAudience audience,
        Guid? recipientUserId,
        int limit,
        CancellationToken cancellationToken);

    Task<int> CountUnreadAsync(
        NotificationAudience audience,
        Guid? recipientUserId,
        CancellationToken cancellationToken);

    Task<bool> MarkReadAsync(
        NotificationAudience audience,
        Guid? recipientUserId,
        Guid notificationId,
        DateTimeOffset readAt,
        CancellationToken cancellationToken);

    Task<int> MarkAllReadAsync(
        NotificationAudience audience,
        Guid? recipientUserId,
        DateTimeOffset readAt,
        CancellationToken cancellationToken);
}
