using System.Security.Cryptography;
using System.Text;
using Postern.Application.Administration;

namespace Postern.Api.Endpoints;

public static class JobEndpoints
{
    public const string SecretHeaderName = "X-Postern-Job-Secret";

    public static IEndpointRouteBuilder MapJobEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/api/jobs/nightly", RunNightlyAsync);
        return endpoints;
    }

    private static async Task<IResult> RunNightlyAsync(
        HttpContext context,
        IConfiguration configuration,
        NightlyMaintenanceService service,
        CancellationToken cancellationToken)
    {
        var configuredSecret = configuration["Jobs:SharedSecret"];
        if (string.IsNullOrWhiteSpace(configuredSecret))
        {
            return Results.Problem(
                "The nightly job is not configured.",
                statusCode: StatusCodes.Status503ServiceUnavailable);
        }

        var providedSecret = context.Request.Headers[SecretHeaderName].ToString();
        if (!SecretsMatch(configuredSecret, providedSecret))
        {
            return Results.Unauthorized();
        }

        var result = await service.RunAsync(cancellationToken);
        return Results.Ok(result);
    }

    private static bool SecretsMatch(string expected, string provided)
    {
        var expectedBytes = Encoding.UTF8.GetBytes(expected);
        var providedBytes = Encoding.UTF8.GetBytes(provided);
        return expectedBytes.Length == providedBytes.Length
            && CryptographicOperations.FixedTimeEquals(expectedBytes, providedBytes);
    }
}
