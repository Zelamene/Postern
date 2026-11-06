using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Postern.Application.Notifications;
using Postern.Domain.Notifications;

namespace Postern.Api.Endpoints;

public static class NotificationEndpoints
{
    public static IEndpointRouteBuilder MapNotificationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var user = endpoints.MapGroup("/api/notifications")
            .RequireAuthorization();
        user.MapGet("", ListUserNotificationsAsync);
        user.MapPost("{notificationId:guid}/read", MarkUserNotificationReadAsync);
        user.MapPost("read-all", MarkAllUserNotificationsReadAsync);

        var admin = endpoints.MapGroup("/api/admin/notifications")
            .RequireAuthorization("admin");
        admin.MapGet("", ListAdminNotificationsAsync);
        admin.MapPost("{notificationId:guid}/read", MarkAdminNotificationReadAsync);
        admin.MapPost("read-all", MarkAllAdminNotificationsReadAsync);

        return endpoints;
    }

    private static async Task<IResult> ListUserNotificationsAsync(
        ClaimsPrincipal user,
        NotificationService service,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        context.Response.Headers.CacheControl = "no-store";
        var userId = GetCurrentUserId(user);
        if (userId is null)
        {
            return Results.Unauthorized();
        }

        var inbox = await service.ListAsync(
            NotificationAudience.User,
            userId.Value,
            cancellationToken);
        return Results.Ok(ToResponse(inbox));
    }

    private static async Task<IResult> MarkUserNotificationReadAsync(
        Guid notificationId,
        ClaimsPrincipal user,
        NotificationService service,
        CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId(user);
        if (userId is null)
        {
            return Results.Unauthorized();
        }

        var updated = await service.MarkReadAsync(
            NotificationAudience.User,
            userId.Value,
            notificationId,
            cancellationToken);
        return updated ? Results.NoContent() : Results.NotFound();
    }

    private static async Task<IResult> MarkAllUserNotificationsReadAsync(
        ClaimsPrincipal user,
        NotificationService service,
        CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId(user);
        if (userId is null)
        {
            return Results.Unauthorized();
        }

        await service.MarkAllReadAsync(
            NotificationAudience.User,
            userId.Value,
            cancellationToken);
        return Results.NoContent();
    }

    private static async Task<IResult> ListAdminNotificationsAsync(
        NotificationService service,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        context.Response.Headers.CacheControl = "no-store";
        var inbox = await service.ListAsync(
            NotificationAudience.Admin,
            null,
            cancellationToken);
        return Results.Ok(ToResponse(inbox));
    }

    private static async Task<IResult> MarkAdminNotificationReadAsync(
        Guid notificationId,
        NotificationService service,
        CancellationToken cancellationToken)
    {
        var updated = await service.MarkReadAsync(
            NotificationAudience.Admin,
            null,
            notificationId,
            cancellationToken);
        return updated ? Results.NoContent() : Results.NotFound();
    }

    private static async Task<IResult> MarkAllAdminNotificationsReadAsync(
        NotificationService service,
        CancellationToken cancellationToken)
    {
        await service.MarkAllReadAsync(
            NotificationAudience.Admin,
            null,
            cancellationToken);
        return Results.NoContent();
    }

    private static NotificationInboxResponse ToResponse(NotificationInbox inbox) =>
        new(
            inbox.UnreadCount,
            inbox.Notifications
                .Select(notification => new NotificationResponse(
                    notification.Id,
                    notification.Kind,
                    notification.Title,
                    notification.Body,
                    notification.Link,
                    notification.CreatedAt,
                    notification.ReadAt))
                .ToList());

    private static Guid? GetCurrentUserId(ClaimsPrincipal user)
    {
        var value = user.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(value, out var id) ? id : null;
    }

    public sealed record NotificationInboxResponse(
        int UnreadCount,
        IReadOnlyList<NotificationResponse> Notifications);

    public sealed record NotificationResponse(
        Guid Id,
        string Kind,
        string Title,
        string? Body,
        string? Link,
        DateTimeOffset CreatedAt,
        DateTimeOffset? ReadAt);
}
