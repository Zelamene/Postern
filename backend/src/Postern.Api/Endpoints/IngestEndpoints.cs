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
        IngestRequest request,
        IngestService ingestService,
        CancellationToken cancellationToken)
    {
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
