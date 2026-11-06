using System.Security.Cryptography;
using System.Text;
using Postern.Api.Notifications;
using Postern.Api.Realtime;
using Postern.Application.Activity;
using Postern.Domain.Notifications;

namespace Postern.Api.Endpoints;

public static class IngestEndpoints
{
    public static IEndpointRouteBuilder MapIngestEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/api/ingest", IngestAsync);
        return endpoints;
    }

    private static async Task<IResult> IngestAsync(
        HttpContext context,
        IngestRequest? request,
        IngestService ingestService,
        RateLimitService rateLimits,
        IConfiguration configuration,
        IUserRealtimeNotifier userRealtime,
        IAdminRealtimeNotifier adminRealtime,
        INotificationPublisher notifications,
        CancellationToken cancellationToken)
    {
        if (!IsAuthorized(context, configuration))
        {
            return Results.Unauthorized();
        }

        if (request is null)
        {
            return Results.BadRequest(new { status = "dropped" });
        }

        var outcome = await ingestService.IngestWithOutcomeAsync(
            request.RecipientAddress ?? string.Empty,
            request.EnvelopeSender ?? string.Empty,
            request.FromHeader ?? string.Empty,
            request.Subject,
            request.AuthenticationResult ?? "unknown",
            cancellationToken,
            request.Blocked ?? false,
            request.Reason,
            request.MessageId);

        if (outcome.Result == IngestResult.Accepted)
        {
            await rateLimits.RebuildRateLimitedUsersAsync(cancellationToken);
        }

        await NotifyAsync(outcome, userRealtime, adminRealtime, notifications, cancellationToken);

        return outcome.Result switch
        {
            IngestResult.Accepted => Results.Accepted("/api/ingest", new { status = "accepted" }),
            IngestResult.Duplicate => Results.Ok(new { status = "duplicate" }),
            IngestResult.Blocked => Results.Ok(new { status = "blocked" }),
            IngestResult.UnknownAlias => Results.NotFound(new { status = "unknown_alias" }),
            IngestResult.Dropped => Results.BadRequest(new { status = "dropped" }),
            _ => Results.BadRequest(new { status = "dropped" })
        };
    }

    private static async Task NotifyAsync(
        IngestOutcome outcome,
        IUserRealtimeNotifier userRealtime,
        IAdminRealtimeNotifier adminRealtime,
        INotificationPublisher notifications,
        CancellationToken cancellationToken)
    {
        if (outcome.AliasId is not { } aliasId || outcome.UserId is not { } userId)
        {
            return;
        }

        switch (outcome.Result)
        {
            case IngestResult.Accepted:
                await userRealtime.MessageReceivedAsync(userId, aliasId);
                await adminRealtime.OperationsChangedAsync();
                await notifications.PublishUserAsync(
                    userId,
                    NotificationKind.MessageReceived,
                    "New mail arrived",
                    null,
                    $"/app/aliases/{aliasId}",
                    cancellationToken);
                break;
            case IngestResult.Blocked:
                await userRealtime.BlockedMessageReceivedAsync(userId, aliasId);
                await adminRealtime.OperationsChangedAsync();
                await notifications.PublishUserAsync(
                    userId,
                    NotificationKind.MessageBlocked,
                    "A message was blocked",
                    null,
                    "/app/blocked",
                    cancellationToken);
                break;
        }
    }

    private static bool IsAuthorized(HttpContext context, IConfiguration configuration)
    {
        var configuredSecret = configuration["Ingest:SharedSecret"];
        if (string.IsNullOrWhiteSpace(configuredSecret))
        {
            return true;
        }

        var providedSecret = context.Request.Headers["X-Postern-Ingest-Secret"].ToString();
        if (string.IsNullOrEmpty(providedSecret))
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(configuredSecret),
            Encoding.UTF8.GetBytes(providedSecret));
    }
}
