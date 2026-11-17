using Microsoft.Extensions.Logging;
using Postern.Application.Integrations;

namespace Postern.Infrastructure.Integrations;


public sealed class HttpJobHeartbeat(
    HttpClient httpClient,
    string pingUrl,
    ILogger<HttpJobHeartbeat> logger) : IJobHeartbeat
{
    public async Task NotifyCompletedAsync(CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(pingUrl))
        {
            return;
        }

        try
        {
            using var response = await httpClient.GetAsync(pingUrl, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning(
                    "The heartbeat monitor answered HTTP {StatusCode} for the job ping.",
                    (int)response.StatusCode);
            }
        }
        catch (Exception exception) when (exception is not OperationCanceledException
            || !cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(
                exception,
                "The heartbeat ping failed. The job result is unaffected.");
        }
    }
}
