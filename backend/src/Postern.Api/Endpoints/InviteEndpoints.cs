using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Postern.Api.Realtime;
using Postern.Api.Security;
using Postern.Application.Accounts;

namespace Postern.Api.Endpoints;

public static class InviteEndpoints
{
    public static IEndpointRouteBuilder MapInviteEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/api/invite-requests", RequestInviteAsync)
            .RequireRateLimiting("invite-request")
            .WithSummary("Request an invitation")
            .WithDescription("Stores an invitation request for administrator review. It does not send an email.");

        var admin = endpoints.MapGroup("/api/admin")
            .RequireAuthorization("admin");
        admin.MapGet("/invites", GetAdminDashboardAsync);
        admin.MapGet("/invite-requests", ListInviteRequestsAsync);
        admin.MapPost("/invite-requests/{requestId:guid}/approve", ApproveInviteRequestAsync);
        admin.MapPost("/invite-requests/{requestId:guid}/reject", RejectInviteRequestAsync);
        admin.MapPost("/invites/{inviteId:guid}/resend", ResendInviteAsync);
        admin.MapPost("/invites/{inviteId:guid}/revoke", RevokeInviteAsync);

        endpoints.MapPost("/api/webhooks/resend", HandleResendWebhookAsync)
            .AllowAnonymous()
            .WithSummary("Receive Resend delivery events")
            .WithDescription("Verifies Resend's Svix signature before recording delivery, bounce, or complaint events.");
        return endpoints;
    }

    private static async Task<IResult> GetAdminDashboardAsync(
        InviteManagementService service,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        context.Response.Headers.CacheControl = "no-store";
        var dashboard = await service.GetAdminDashboardAsync(cancellationToken);
        return Results.Ok(dashboard);
    }

    private static async Task<IResult> RequestInviteAsync(
        InviteRequestBody request,
        InviteManagementService service,
        IAdminRealtimeNotifier realtimeNotifier,
        CancellationToken cancellationToken)
    {
        try
        {
            await service.RequestInviteAsync(request.Email, cancellationToken);
        }
        catch (ArgumentException)
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["email"] = ["Enter a valid email address."]
            });
        }

        await realtimeNotifier.InviteRequestReceivedAsync();
        return Results.Accepted(
            value: new { message = "If eligible, your request has been recorded for review." });
    }

    private static async Task<IResult> ListInviteRequestsAsync(
        InviteManagementService service,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        context.Response.Headers.CacheControl = "no-store";
        var requests = await service.ListPendingRequestsAsync(cancellationToken);
        return Results.Ok(new { requests });
    }

    private static async Task<IResult> ApproveInviteRequestAsync(
        Guid requestId,
        ClaimsPrincipal user,
        InviteManagementService service,
        IAdminRealtimeNotifier realtimeNotifier,
        CancellationToken cancellationToken)
    {
        var adminUserId = GetCurrentUserId(user);
        if (adminUserId is null)
        {
            return Results.Unauthorized();
        }

        var approved = await service.ApproveRequestAsync(
            requestId,
            adminUserId.Value,
            user.FindFirstValue(ClaimTypes.Email) ?? "An admin",
            cancellationToken);
        if (!approved)
        {
            return Results.NotFound();
        }

        await realtimeNotifier.InvitesChangedAsync();
        return Results.Accepted();
    }

    private static async Task<IResult> RejectInviteRequestAsync(
        Guid requestId,
        ClaimsPrincipal user,
        InviteManagementService service,
        IAdminRealtimeNotifier realtimeNotifier,
        CancellationToken cancellationToken)
    {
        var adminUserId = GetCurrentUserId(user);
        if (adminUserId is null)
        {
            return Results.Unauthorized();
        }

        var rejected = await service.RejectRequestAsync(requestId, adminUserId.Value, cancellationToken);
        if (!rejected)
        {
            return Results.NotFound();
        }

        await realtimeNotifier.InvitesChangedAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> ResendInviteAsync(
        Guid inviteId,
        ClaimsPrincipal user,
        InviteManagementService service,
        IAdminRealtimeNotifier realtimeNotifier,
        CancellationToken cancellationToken)
    {
        var adminUserId = GetCurrentUserId(user);
        if (adminUserId is null)
        {
            return Results.Unauthorized();
        }

        var resent = await service.ResendAsync(
            inviteId,
            adminUserId.Value,
            user.FindFirstValue(ClaimTypes.Email) ?? "An admin",
            cancellationToken);
        if (!resent)
        {
            return Results.NotFound();
        }

        await realtimeNotifier.InvitesChangedAsync();
        return Results.Accepted();
    }

    private static async Task<IResult> RevokeInviteAsync(
        Guid inviteId,
        ClaimsPrincipal user,
        InviteManagementService service,
        IAdminRealtimeNotifier realtimeNotifier,
        CancellationToken cancellationToken)
    {
        var adminUserId = GetCurrentUserId(user);
        if (adminUserId is null)
        {
            return Results.Unauthorized();
        }

        var revoked = await service.RevokeAsync(inviteId, adminUserId.Value, cancellationToken);
        if (!revoked)
        {
            return Results.NotFound();
        }

        await realtimeNotifier.InvitesChangedAsync();
        return Results.NoContent();
    }

    private static async Task<IResult> HandleResendWebhookAsync(
        HttpContext context,
        ResendWebhookSignatureVerifier signatureVerifier,
        InviteManagementService service,
        CancellationToken cancellationToken)
    {
        const int maximumBodySize = 64 * 1024;
        if (context.Request.ContentLength > maximumBodySize)
        {
            return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
        }

        var buffer = new byte[maximumBodySize + 1];
        var bytesRead = 0;
        while (bytesRead < buffer.Length)
        {
            var read = await context.Request.Body.ReadAsync(
                buffer.AsMemory(bytesRead, buffer.Length - bytesRead),
                cancellationToken);
            if (read == 0)
            {
                break;
            }
            bytesRead += read;
        }
        if (bytesRead > maximumBodySize)
        {
            return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
        }
        var body = Encoding.UTF8.GetString(buffer, 0, bytesRead);

        if (!signatureVerifier.IsValid(
                context.Request.Headers["svix-id"].ToString(),
                context.Request.Headers["svix-timestamp"].ToString(),
                context.Request.Headers["svix-signature"].ToString(),
                body))
        {
            return Results.Unauthorized();
        }

        try
        {
            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object
                || !root.TryGetProperty("type", out var typeElement)
                || typeElement.ValueKind != JsonValueKind.String
                || !root.TryGetProperty("data", out var data)
                || data.ValueKind != JsonValueKind.Object)
            {
                return Results.BadRequest();
            }

            var eventType = typeElement.GetString();
            string? providerMessageId = null;
            if (data.TryGetProperty("email_id", out var emailId))
            {
                if (emailId.ValueKind != JsonValueKind.String)
                {
                    return Results.BadRequest();
                }
                providerMessageId = emailId.GetString();
            }
            if (string.IsNullOrWhiteSpace(eventType))
            {
                return Results.BadRequest();
            }

            var eventId = context.Request.Headers["svix-id"].ToString();
            if (string.IsNullOrWhiteSpace(eventId)
                || eventId.Length > 256
                || eventType.Length > 64
                || providerMessageId?.Length > 128)
            {
                return Results.BadRequest();
            }

            await service.RecordWebhookEventAsync(
                eventId,
                eventType,
                providerMessageId,
                cancellationToken);
            return Results.Ok();
        }
        catch (JsonException)
        {
            return Results.BadRequest();
        }
        catch (KeyNotFoundException)
        {
            return Results.BadRequest();
        }
        catch (InvalidOperationException)
        {
            return Results.BadRequest();
        }
    }

    private static Guid? GetCurrentUserId(ClaimsPrincipal user)
    {
        var value = user.FindFirstValue(ClaimTypes.NameIdentifier);
        return Guid.TryParse(value, out var id) ? id : null;
    }

    public sealed record InviteRequestBody(string? Email);
}
