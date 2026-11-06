using Postern.Domain.Notifications;

namespace Postern.Application.Notifications;

public sealed record NotificationInbox(
    IReadOnlyList<Notification> Notifications,
    int UnreadCount);

public sealed class NotificationService(
    INotificationRepository notifications,
    TimeProvider timeProvider)
{
    public const int DefaultLimit = 50;
    public const int MaximumTitleLength = 160;
    public const int MaximumBodyLength = 500;
    public const int MaximumLinkLength = 300;
    public const int MaximumKindLength = 64;

    public async Task<NotificationInbox> ListAsync(
        NotificationAudience audience,
        Guid? recipientUserId,
        CancellationToken cancellationToken)
    {
        var items = await notifications.ListAsync(
            audience,
            recipientUserId,
            DefaultLimit,
            cancellationToken);
        var unread = await notifications.CountUnreadAsync(
            audience,
            recipientUserId,
            cancellationToken);

        return new NotificationInbox(items, unread);
    }

    public Task<bool> MarkReadAsync(
        NotificationAudience audience,
        Guid? recipientUserId,
        Guid notificationId,
        CancellationToken cancellationToken) =>
        notifications.MarkReadAsync(
            audience,
            recipientUserId,
            notificationId,
            timeProvider.GetUtcNow(),
            cancellationToken);

    public Task<int> MarkAllReadAsync(
        NotificationAudience audience,
        Guid? recipientUserId,
        CancellationToken cancellationToken) =>
        notifications.MarkAllReadAsync(
            audience,
            recipientUserId,
            timeProvider.GetUtcNow(),
            cancellationToken);

    public Task PublishAsync(
        NotificationAudience audience,
        Guid? recipientUserId,
        string kind,
        string title,
        string? body,
        string? link,
        CancellationToken cancellationToken) =>
        notifications.AddAsync(
            new Notification
            {
                Id = Guid.NewGuid(),
                Audience = audience,
                RecipientUserId = recipientUserId,
                Kind = TruncateRequired(kind, MaximumKindLength, "account_changed"),
                Title = TruncateRequired(title, MaximumTitleLength, "Account update"),
                Body = Truncate(body?.Trim(), MaximumBodyLength),
                Link = Truncate(link?.Trim(), MaximumLinkLength),
                CreatedAt = timeProvider.GetUtcNow()
            },
            cancellationToken);

    private static string TruncateRequired(string? value, int maximumLength, string fallback)
    {
        var truncated = Truncate(value?.Trim(), maximumLength);
        return truncated ?? fallback;
    }

    private static string? Truncate(string? value, int maximumLength)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Length <= maximumLength ? value : value[..maximumLength];
    }
}
