using Postern.Application.Aliases;
using Postern.Domain.Activity;

namespace Postern.Application.Activity;

/// <summary>
/// Read model for a user's activity. Every query is scoped to the owning user and to the
/// 90-day retention window, even though rows may still exist in the database.
/// </summary>
public sealed class ActivityService(
    IActivityRepository activity,
    IAliasRepository aliases,
    TimeProvider timeProvider)
{
    public const int DefaultPageSize = 25;
    public const int MaximumPageSize = 100;

    /// <summary>Activity older than this is never returned by the read endpoints.</summary>
    public static readonly TimeSpan RetentionWindow = TimeSpan.FromDays(90);

    /// <summary>
    /// Recent messages for one alias. Returns <c>null</c> when the alias is not owned by the caller,
    /// so the endpoint can answer 404 without leaking whether the alias exists.
    /// </summary>
    public async Task<ActivityPage<Message>?> ListMessagesAsync(
        Guid userId,
        Guid aliasId,
        int? pageSize,
        ActivityCursor? cursor,
        CancellationToken cancellationToken)
    {
        if (await aliases.GetOwnedAliasAsync(aliasId, userId, cancellationToken) is null)
        {
            return null;
        }

        var limit = NormalizePageSize(pageSize);
        var rows = await activity.ListMessagesAsync(
            aliasId,
            RetentionCutoff(),
            cursor?.ReceivedAt,
            cursor?.Id,
            limit + 1,
            cancellationToken);

        return BuildPage(rows, limit, message => ActivityCursor.Encode(message.ReceivedAt, message.Id));
    }


    public async Task<ActivityPage<BlockedMessage>?> ListBlockedMessagesAsync(
        Guid userId,
        Guid? aliasId,
        int? pageSize,
        ActivityCursor? cursor,
        CancellationToken cancellationToken)
    {
        if (aliasId is { } scopedAliasId
            && await aliases.GetOwnedAliasAsync(scopedAliasId, userId, cancellationToken) is null)
        {
            return null;
        }

        var limit = NormalizePageSize(pageSize);
        var rows = await activity.ListBlockedMessagesForUserAsync(
            userId,
            aliasId,
            RetentionCutoff(),
            cursor?.ReceivedAt,
            cursor?.Id,
            limit + 1,
            cancellationToken);

        return BuildPage(rows, limit, message => ActivityCursor.Encode(message.ReceivedAt, message.Id));
    }

    public static int NormalizePageSize(int? pageSize) =>
        pageSize is null or <= 0
            ? DefaultPageSize
            : Math.Min(pageSize.Value, MaximumPageSize);

    private DateTimeOffset RetentionCutoff() => timeProvider.GetUtcNow() - RetentionWindow;

    private static ActivityPage<T> BuildPage<T>(
        IReadOnlyList<T> rows,
        int limit,
        Func<T, string> cursorSelector)
    {
        if (rows.Count <= limit)
        {
            return new ActivityPage<T>(rows, null);
        }

        var items = rows.Take(limit).ToArray();
        return new ActivityPage<T>(items, cursorSelector(items[^1]));
    }
}
