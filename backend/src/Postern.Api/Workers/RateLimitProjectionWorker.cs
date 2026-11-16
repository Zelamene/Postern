using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Postern.Application.Activity;

namespace Postern.Api.Workers;

public sealed class RateLimitProjectionWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<RateLimitProjectionWorker> logger) : BackgroundService
{
    public static readonly TimeSpan RefreshInterval = TimeSpan.FromMinutes(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(RefreshInterval);

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var rateLimits = scope.ServiceProvider.GetRequiredService<RateLimitService>();
                await rateLimits.RebuildRateLimitedUsersAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                logger.LogWarning(
                    exception,
                    "Rate-limit projection refresh failed; the next tick will retry.");
            }
        }
    }
}
