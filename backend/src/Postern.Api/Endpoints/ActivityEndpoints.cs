using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Postern.Application.Activity;
using Postern.Domain.Activity;

namespace Postern.Api.Endpoints;

public static class ActivityEndpoints
{
    public static IEndpointRouteBuilder MapActivityEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/api/aliases/{aliasId:guid}/messages", ListMessagesAsync)
            .RequireAuthorization();
        endpoints.MapGet("/api/messages/blocked", ListBlockedMessagesAsync)
            .RequireAuthorization();
        return endpoints;
    }

    private static async Task<IResult> ListMessagesAsync(
        Guid aliasId,
        string? cursor,
        int? limit,
        ClaimsPrincipal user,
        ActivityService service,
        CancellationToken cancellationToken)
    {
        var currentUserId = GetCurrentUserId(user);
        if (currentUserId is null)
        {
            return Results.Unauthorized();
        }

        if (!TryReadCursor(cursor, out var activityCursor))
        {
            return Results.BadRequest(new { error = "invalid_cursor" });
        }

        var page = await service.ListMessagesAsync(
            currentUserId.Value,
            aliasId,
            limit,
            activityCursor,
            cancellationToken);

        return page is null
            ? Results.NotFound()
            : Results.Ok(MapPage(page, MapMessage));
    }

    private static async Task<IResult> ListBlockedMessagesAsync(
        Guid? aliasId,
        string? cursor,
        int? limit,
        ClaimsPrincipal user,
        ActivityService service,
        CancellationToken cancellationToken)
    {
        var currentUserId = GetCurrentUserId(user);
        if (currentUserId is null)
        {
            return Results.Unauthorized();
        }

        if (!TryReadCursor(cursor, out var activityCursor))
        {
            return Results.BadRequest(new { error = "invalid_cursor" });
        }

        var page = await service.ListBlockedMessagesAsync(
            currentUserId.Value,
            aliasId,
            limit,
            activityCursor,
            cancellationToken);

        return page is null
            ? Results.NotFound()
            : Results.Ok(MapPage(page, MapBlockedMessage));
    }

    private static bool TryReadCursor(string? value, out ActivityCursor? cursor)
    {
        cursor = null;
        if (string.IsNullOrWhiteSpace(value))
        {
            return true;
        }

        if (!ActivityCursor.TryDecode(value, out var decoded))
        {
            return false;
        }

        cursor = decoded;
        return true;
    }

    private static ActivityPageResponse<TResponse> MapPage<TSource, TResponse>(
        ActivityPage<TSource> page,
        Func<TSource, TResponse> selector) =>
        new(page.Items.Select(selector).ToArray(), page.NextCursor);

    private static MessageResponse MapMessage(Message message) =>
        new(
            message.Id,
            message.AliasId,
            message.FromHeader,
            message.EnvelopeSender,
            message.Subject,
            message.ReceivedAt,
            message.AuthenticationResult,
            message.IsFlagged,
            message.FlagReason);

    private static BlockedMessageResponse MapBlockedMessage(BlockedMessage message) =>
        new(
            message.Id,
            message.AliasId,
            message.FromHeader,
            message.Subject,
            message.ReceivedAt,
            message.Reason);

    private static Guid? GetCurrentUserId(ClaimsPrincipal user)
    {
        var value = user.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(value, out var id) ? id : null;
    }

    public sealed record ActivityPageResponse<T>(IReadOnlyList<T> Items, string? NextCursor);

    public sealed record MessageResponse(
        Guid Id,
        Guid AliasId,
        string FromHeader,
        string EnvelopeSender,
        string? Subject,
        DateTimeOffset ReceivedAt,
        string AuthenticationResult,
        bool IsFlagged,
        string? FlagReason);

    public sealed record BlockedMessageResponse(
        Guid Id,
        Guid AliasId,
        string FromHeader,
        string? Subject,
        DateTimeOffset ReceivedAt,
        string Reason);
}
