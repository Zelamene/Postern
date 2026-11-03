using System.Text.Json;
using Postern.Application.Integrations;

namespace Postern.Application.Activity;

public sealed class RateLimitService(
    IActivityRepository activityRepository,
    IKvWriter kvWriter,
    TimeProvider timeProvider)
{
    public const int DailyForwardingLimit = 500;
    public const string KvKey = "rate_limited_users";

    private static readonly SemaphoreSlim WriterLock = new(1, 1);

    public async Task RebuildRateLimitedUsersAsync(CancellationToken cancellationToken)
    {
        await WriterLock.WaitAsync(cancellationToken);
        try
        {
            var windowStart = timeProvider.GetUtcNow().AddHours(-24);
            var counts = await activityRepository.CountForwardedMessagesPerUserAsync(
                windowStart,
                cancellationToken);

            var limitedUntil = timeProvider.GetUtcNow().AddHours(24).ToUnixTimeSeconds();
            var limited = counts
                .Where(pair => pair.Value > DailyForwardingLimit)
                .ToDictionary(pair => pair.Key.ToString(), _ => limitedUntil);

            if (limited.Count == 0)
            {
                return;
            }

            try
            {
                await kvWriter.PutAsync(
                    KvKey,
                    JsonSerializer.Serialize(new { users = limited }),
                    cancellationToken);
            }
            catch
            {
                // Ingest must not fail because the map could not be published; the next accepted
                // message rebuilds the same map from the database.
            }
        }
        finally
        {
            WriterLock.Release();
        }
    }
}
