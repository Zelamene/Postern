using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Postern.Api.Notifications;
using Postern.Api.Realtime;
using Postern.Application.Accounts;
using Postern.Application.Administration;
using Postern.Domain.Notifications;

namespace Postern.Api.Endpoints;

public static class AdministrationEndpoints
{
    public static IEndpointRouteBuilder MapAdministrationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/admin")
            .RequireAuthorization("admin");

        group.MapPost("/suspended-users/rebuild", RebuildSuspendedUsersAsync);
        group.MapPost("/users/{userId:guid}/suspend", SuspendUserAsync);
        group.MapPost("/users/{userId:guid}/resume", ResumeUserAsync);
        group.MapGet("/global-blocklist", ListBlockedDomainsAsync);
        group.MapPost("/global-blocklist", BlockDomainAsync);
        group.MapDelete("/global-blocklist/{domain}", UnblockDomainAsync);
        group.MapGet("/analytics", GetAnalyticsAsync);
        group.MapPost("/kv-sync", SyncKvAsync);

        return endpoints;
    }

    private static async Task<IResult> RebuildSuspendedUsersAsync(
        SuspendedUserService service,
        IAdminRealtimeNotifier realtimeNotifier,
        INotificationPublisher notifications,
        CancellationToken cancellationToken)
    {
        await service.RebuildAsync(cancellationToken);
        await realtimeNotifier.OperationsChangedAsync();
        await notifications.PublishAdminAsync(
            NotificationKind.SuspendedUsersRebuilt,
            "Suspended user projection rebuilt",
            null,
            "/admin",
            cancellationToken);
        return Results.NoContent();
    }

    private static async Task<IResult> SuspendUserAsync(
        Guid userId,
        SuspendUserRequest? request,
        ClaimsPrincipal user,
        AdministrationService service,
        IUserRealtimeNotifier userRealtime,
        IAdminRealtimeNotifier adminRealtime,
        INotificationPublisher notifications,
        CancellationToken cancellationToken)
    {
        var adminUserId = GetCurrentUserId(user);
        if (adminUserId is null)
        {
            return Results.Unauthorized();
        }

        var outcome = await service.SuspendUserAsync(
            adminUserId.Value,
            userId,
            request?.Reason,
            cancellationToken);

        if (outcome == AdminOutcome.Succeeded)
        {
            await userRealtime.AccountChangedAsync(userId);
            await adminRealtime.OperationsChangedAsync();
            await notifications.PublishAdminAsync(
                NotificationKind.UserSuspended,
                "User suspended",
                null,
                "/admin",
                cancellationToken);
        }

        return ToResult(outcome);
    }

    private static async Task<IResult> ResumeUserAsync(
        Guid userId,
        ResumeUserRequest? request,
        ClaimsPrincipal user,
        AdministrationService service,
        IUserRealtimeNotifier userRealtime,
        IAdminRealtimeNotifier adminRealtime,
        INotificationPublisher notifications,
        CancellationToken cancellationToken)
    {
        var adminUserId = GetCurrentUserId(user);
        if (adminUserId is null)
        {
            return Results.Unauthorized();
        }

        var outcome = await service.ResumeUserAsync(
            adminUserId.Value,
            userId,
            request?.Reason,
            cancellationToken);

        if (outcome == AdminOutcome.Succeeded)
        {
            await userRealtime.AccountChangedAsync(userId);
            await adminRealtime.OperationsChangedAsync();
            await notifications.PublishAdminAsync(
                NotificationKind.UserResumed,
                "User resumed",
                null,
                "/admin",
                cancellationToken);
        }

        return ToResult(outcome);
    }

    private static async Task<IResult> BlockDomainAsync(
        BlockDomainRequest request,
        ClaimsPrincipal user,
        AdministrationService service,
        IAdminRealtimeNotifier realtimeNotifier,
        INotificationPublisher notifications,
        CancellationToken cancellationToken)
    {
        var adminUserId = GetCurrentUserId(user);
        if (adminUserId is null)
        {
            return Results.Unauthorized();
        }

        var outcome = await service.BlockDomainAsync(
            adminUserId.Value,
            request.Domain,
            request.Reason,
            cancellationToken);

        if (outcome == AdminOutcome.Succeeded)
        {
            await realtimeNotifier.OperationsChangedAsync();
            await notifications.PublishAdminAsync(
                NotificationKind.BlocklistChanged,
                "Domain added to the global blocklist",
                request.Domain?.Trim(),
                "/admin",
                cancellationToken);
        }

        return ToResult(outcome);
    }

    private static async Task<IResult> UnblockDomainAsync(
        string domain,
        ClaimsPrincipal user,
        AdministrationService service,
        IAdminRealtimeNotifier realtimeNotifier,
        INotificationPublisher notifications,
        CancellationToken cancellationToken)
    {
        var adminUserId = GetCurrentUserId(user);
        if (adminUserId is null)
        {
            return Results.Unauthorized();
        }

        var outcome = await service.UnblockDomainAsync(adminUserId.Value, domain, cancellationToken);
        if (outcome == AdminOutcome.Succeeded)
        {
            await realtimeNotifier.OperationsChangedAsync();
            await notifications.PublishAdminAsync(
                NotificationKind.BlocklistChanged,
                "Domain removed from the global blocklist",
                domain,
                "/admin",
                cancellationToken);
        }

        return ToResult(outcome);
    }

    private static async Task<IResult> ListBlockedDomainsAsync(
        AdministrationService service,
        CancellationToken cancellationToken)
    {
        var domains = await service.ListBlockedDomainsAsync(cancellationToken);
        var entries = await service.ListBlocklistEntriesAsync(cancellationToken);
        return Results.Ok(new
        {
            domains,
            entries = entries.Select(entry => new
            {
                domain = entry.Domain,
                reason = entry.Reason,
                createdAt = entry.CreatedAt
            })
        });
    }

    private static async Task<IResult> GetAnalyticsAsync(
        int? windowHours,
        int? minimumDomainVolume,
        AdminAnalyticsService service,
        CancellationToken cancellationToken)
    {
        var analytics = await service.GetAsync(windowHours, minimumDomainVolume, cancellationToken);
        return Results.Ok(analytics);
    }

    private static async Task<IResult> SyncKvAsync(
        ClaimsPrincipal user,
        AdminKvSyncService service,
        IAdminRealtimeNotifier realtimeNotifier,
        INotificationPublisher notifications,
        CancellationToken cancellationToken)
    {
        var adminUserId = GetCurrentUserId(user);
        if (adminUserId is null)
        {
            return Results.Unauthorized();
        }

        var result = await service.SyncAsync(adminUserId.Value, cancellationToken);
        await realtimeNotifier.OperationsChangedAsync();
        await notifications.PublishAdminAsync(
            NotificationKind.KvSyncCompleted,
            "KV sync completed",
            $"{result.AliasesSynced} aliases synced, {result.AliasesFailed} failed",
            "/admin",
            cancellationToken);
        return Results.Ok(result);
    }

    private static IResult ToResult(AdminOutcome outcome) =>
        outcome switch
        {
            AdminOutcome.Succeeded => Results.NoContent(),
            AdminOutcome.NotFound => Results.NotFound(),
            _ => Results.BadRequest()
        };

    private static Guid? GetCurrentUserId(ClaimsPrincipal user)
    {
        var value = user.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(value, out var id) ? id : null;
    }

    public sealed record SuspendUserRequest(string? Reason);

    public sealed record ResumeUserRequest(string? Reason);

    public sealed record BlockDomainRequest(string? Domain, string? Reason);
}
