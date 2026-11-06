using System.Security.Cryptography;
using System.Text;
using Postern.Application.Activity;

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

        var result = await ingestService.IngestAsync(
            request.RecipientAddress ?? string.Empty,
            request.EnvelopeSender ?? string.Empty,
            request.FromHeader ?? string.Empty,
            request.Subject,
            request.AuthenticationResult ?? "unknown",
            cancellationToken,
            request.Blocked ?? false,
            request.Reason,
            request.MessageId);

        if (result == IngestResult.Accepted)
        {
            await rateLimits.RebuildRateLimitedUsersAsync(cancellationToken);
        }

        return result switch
        {
            IngestResult.Accepted => Results.Accepted("/api/ingest", new { status = "accepted" }),
            IngestResult.Duplicate => Results.Ok(new { status = "duplicate" }),
            IngestResult.Blocked => Results.Ok(new { status = "blocked" }),
            IngestResult.UnknownAlias => Results.NotFound(new { status = "unknown_alias" }),
            IngestResult.Dropped => Results.BadRequest(new { status = "dropped" }),
            _ => Results.BadRequest(new { status = "dropped" })
        };
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
