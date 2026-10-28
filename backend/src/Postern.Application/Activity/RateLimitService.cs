using System.Text.Json;
using Postern.Application.Integrations;
using Postern.Application.Activity;

namespace Postern.Application.Activity;

public sealed class RateLimitService(
    IActivityRepository activityRepository,
    IKvWriter kvWriter)
{
    private static readonly SemaphoreSlim Semaphore = new(1, 1);

    public async Task RebuildRateLimitedUsersAsync(CancellationToken cancellationToken)
    {
        await Semaphore.WaitAsync(cancellationToken);
        try
        {
            var count = await activityRepository.CountForwardedMessagesLast24HoursAsync(cancellationToken);
            if (count <= 500)
            {
                var empty = JsonSerializer.Serialize(new { users = new Dictionary<string, long>() });
                await kvWriter.PutAsync("rate_limited_users", empty, cancellationToken);
                return;
            }

            var users = new Dictionary<string, long>();
            var value = JsonSerializer.Serialize(new { users });
            await kvWriter.PutAsync("rate_limited_users", value, cancellationToken);
        }
        finally
        {
            Semaphore.Release();
        }
    }
}
