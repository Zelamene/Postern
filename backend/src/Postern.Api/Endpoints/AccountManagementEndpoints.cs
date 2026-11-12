using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Postern.Api.Notifications;
using Postern.Api.Realtime;
using Postern.Application.Accounts;
using Postern.Domain.Notifications;

namespace Postern.Api.Endpoints;

public static class AccountManagementEndpoints
{
    public static IEndpointRouteBuilder MapAccountManagementEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/users");
        group.MapPost("/change-forwarding-address", ChangeForwardingAddressAsync).RequireAuthorization();
        group.MapDelete("/me", DeleteAccountAsync).RequireAuthorization();
        return endpoints;
    }

    private static async Task<IResult> ChangeForwardingAddressAsync(
        ChangeForwardingAddressRequest request,
        ClaimsPrincipal user,
        AccountManagementService service,
        IUserRealtimeNotifier realtimeNotifier,
        INotificationPublisher notifications,
        CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId(user);
        if (userId is null)
        {
            return Results.Unauthorized();
        }

        var outcome = await service.ChangeForwardingAddressAsync(
            userId.Value,
            request.NewForwardingAddress ?? string.Empty,
            cancellationToken);

        if (outcome == ForwardingChangeResult.VerificationRequired)
        {
            return Results.Conflict(new
            {
                error = "Confirm the new destination from the verification email, then try again.",
                code = "verification_required"
            });
        }

        if (outcome == ForwardingChangeResult.NotFound)
        {
            return Results.NotFound();
        }

        if (outcome != ForwardingChangeResult.Success)
        {
            return Results.BadRequest();
        }

        await realtimeNotifier.AccountChangedAsync(userId.Value);
        await notifications.PublishUserAsync(
            userId.Value,
            NotificationKind.AccountChanged,
            "Forwarding address updated",
            request.NewForwardingAddress?.Trim(),
            "/app/account",
            cancellationToken);
        return Results.NoContent();
    }

    private static async Task<IResult> DeleteAccountAsync(
        ClaimsPrincipal user,
        AccountManagementService service,
        IUserRealtimeNotifier userRealtime,
        IAdminRealtimeNotifier adminRealtime,
        CancellationToken cancellationToken)
    {
        var userId = GetCurrentUserId(user);
        if (userId is null)
        {
            return Results.Unauthorized();
        }

        var success = await service.DeleteAccountAsync(userId.Value, cancellationToken);
        if (!success)
        {
            return Results.NotFound();
        }

        await userRealtime.AccountChangedAsync(userId.Value);
        await adminRealtime.OperationsChangedAsync();
        return Results.NoContent();
    }

    private static Guid? GetCurrentUserId(ClaimsPrincipal user)
    {
        var value = user.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(value, out var id) ? id : null;
    }

    public sealed record ChangeForwardingAddressRequest(string? NewForwardingAddress);
}
