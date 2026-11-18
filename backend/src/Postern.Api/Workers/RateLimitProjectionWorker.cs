using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Postern.Application.Activity;

namespace Postern.Api.Workers;

/// <summary>
/// Supply of ticks for <see cref="RateLimitProjectionWorker"/>.
/// </summary>
/// <remarks>
/// The refresh interval is otherwise untestable: <see cref="PeriodicTimer"/> is not
/// <see cref="TimeProvider"/>-backed, so no fake clock can advance it. Injecting the
/// tick source keeps the production timer (which is what Cloudflare-free hosting
/// actually runs) while letting a test drive an arbitrary number of refreshes
/// without waiting five minutes per tick.
/// </remarks>
public interface IProjectionTicker : IAsyncDisposable
{
    ValueTask<bool> WaitForNextTickAsync(CancellationToken cancellationToken);
}

public sealed class PeriodicProjectionTicker(TimeSpan interval) : IProjectionTicker
{
    private readonly PeriodicTimer timer = new(interval);

    public ValueTask<bool> WaitForNextTickAsync(CancellationToken cancellationToken) =>
        timer.WaitForNextTickAsync(cancellationToken);

    public ValueTask DisposeAsync()
    {
        timer.Dispose();
        return ValueTask.CompletedTask;
    }
}

public sealed class RateLimitProjectionWorker(
    IServiceScopeFactory scopeFactory,
    IProjectionTicker ticker,
    ILogger<RateLimitProjectionWorker> logger) : BackgroundService
{
    public static readonly TimeSpan RefreshInterval = TimeSpan.FromMinutes(5);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (await ticker.WaitForNextTickAsync(stoppingToken))
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
