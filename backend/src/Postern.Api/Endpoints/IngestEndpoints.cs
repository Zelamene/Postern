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
        IngestRequest request,
        IngestService ingestService,
        CancellationToken cancellationToken)
    {
        var configuredSecret = context.RequestServices.GetService<IConfiguration>()?["Ingest:SharedSecret"];
        var providedSecret = context.Request.Headers["X-Postern-Ingest-Secret"].ToString();
        if (!string.IsNullOrWhiteSpace(configuredSecret) && !string.Equals(configuredSecret, providedSecret, StringComparison.Ordinal))
        {
            return Results.Unauthorized();
        }

        var result = await ingestService.IngestAsync(
            request.RecipientAddress ?? string.Empty,
            request.EnvelopeSender ?? string.Empty,
            request.FromHeader ?? string.Empty,
            request.Subject,
            request.AuthenticationResult ?? "unknown",
            cancellationToken);

        return result switch
        {
            IngestResult.Accepted => Results.Accepted("/api/ingest", new { status = "accepted" }),
            IngestResult.Blocked => Results.Ok(new { status = "blocked" }),
            IngestResult.UnknownAlias => Results.NotFound(new { status = "unknown_alias" }),
            IngestResult.Dropped => Results.BadRequest(new { status = "dropped" }),
            _ => Results.BadRequest(new { status = "dropped" })
        };
    }
}
