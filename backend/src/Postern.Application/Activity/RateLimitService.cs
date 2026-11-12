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
    private static HashSet<Guid> _lastLimitedIds = [];
    private static long _lastLimitedUntil;
    private static bool _initialized;

    public async Task RebuildRateLimitedUsersAsync(CancellationToken cancellationToken)
    {
        await WriterLock.WaitAsync(cancellationToken);
        try
        {
            var now = timeProvider.GetUtcNow();
            var counts = await activityRepository.CountForwardedMessagesPerUserAsync(
                now.AddHours(-24),
                cancellationToken);

            var limitedUntil = new DateTimeOffset(
                now.Year, now.Month, now.Day, now.Hour, 0, 0, TimeSpan.Zero)
                .AddHours(25)
                .ToUnixTimeSeconds();

            var limited = counts
                .Where(pair => pair.Value > DailyForwardingLimit)
                .ToDictionary(pair => pair.Key.ToString(), _ => limitedUntil);

            var limitedIds = limited.Keys.Select(Guid.Parse).ToHashSet();

            if (_initialized
                && _lastLimitedUntil == limitedUntil
                && limitedIds.SetEquals(_lastLimitedIds))
            {
                return;
            }

            try
            {
                if (limited.Count == 0)
                {
                    await kvWriter.DeleteAsync(KvKey, cancellationToken);
                }
                else
                {
                    await kvWriter.PutAsync(
                        KvKey,
                        JsonSerializer.Serialize(new { users = limited }),
                        cancellationToken);
                }

                _lastLimitedIds = limitedIds;
                _lastLimitedUntil = limitedUntil;
                _initialized = true;
            }
            catch
            {
            }
        }
        finally
        {
            WriterLock.Release();
        }
    }
}
