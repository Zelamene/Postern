using Postern.Application.Notifications;
using Postern.Domain.Notifications;

namespace Postern.Api.Notifications;

public interface INotificationPublisher
{
    Task PublishUserAsync(
        Guid userId,
        string kind,
        string title,
        string? body,
        string? link,
        CancellationToken cancellationToken);

    Task PublishAdminAsync(
        string kind,
        string title,
        string? body,
        string? link,
        CancellationToken cancellationToken);
}

public sealed class NotificationPublisher(
    IServiceScopeFactory scopeFactory,
    ILogger<NotificationPublisher> logger) : INotificationPublisher
{
    public Task PublishUserAsync(
        Guid userId,
        string kind,
        string title,
        string? body,
        string? link,
        CancellationToken cancellationToken) =>
        PublishAsync(
            NotificationAudience.User,
            userId,
            kind,
            title,
            body,
            link,
            cancellationToken);

    public Task PublishAdminAsync(
        string kind,
        string title,
        string? body,
        string? link,
        CancellationToken cancellationToken) =>
        PublishAsync(
            NotificationAudience.Admin,
            null,
            kind,
            title,
            body,
            link,
            cancellationToken);

    private async Task PublishAsync(
        NotificationAudience audience,
        Guid? recipientUserId,
        string kind,
        string title,
        string? body,
        string? link,
        CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var service = scope.ServiceProvider.GetRequiredService<NotificationService>();
            await service.PublishAsync(
                audience,
                recipientUserId,
                kind,
                title,
                body,
                link,
                cancellationToken);
        }
        catch (Exception exception)
        {
            logger.LogWarning(
                exception,
                "Could not record the {Audience} notification {Kind}; the requested action still succeeded.",
                audience,
                kind);
        }
    }
}
