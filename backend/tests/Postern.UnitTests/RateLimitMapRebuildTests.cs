using System.Text.Json;
using Postern.Application.Activity;
using Postern.Domain.Activity;
using Postern.Domain.Aliases;
using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public class RateLimitMapRebuildTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 30, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Rebuild_WhenNoUserExceedsTheCap_ClearsTheMap()
    {
        var repository = new CountingActivityRepository(new Dictionary<Guid, int>
        {
            [Guid.NewGuid()] = RateLimitService.DailyForwardingLimit
        });
        var kvWriter = new InMemoryKvWriter();
        var service = new RateLimitService(repository, kvWriter, new FixedTimeProvider(Now));

        await service.RebuildRateLimitedUsersAsync(CancellationToken.None);

        Assert.False(kvWriter.Values.ContainsKey(RateLimitService.KvKey));
        Assert.Equal(1, kvWriter.Deletes);
    }

    [Fact]
    public async Task Rebuild_WhenAUserExceedsTheCap_WritesTheirIdWithAHourStableExpiry()
    {
        var limitedUser = Guid.NewGuid();
        var repository = new CountingActivityRepository(new Dictionary<Guid, int>
        {
            [limitedUser] = RateLimitService.DailyForwardingLimit + 1
        });
        var kvWriter = new InMemoryKvWriter();
        var service = new RateLimitService(repository, kvWriter, new FixedTimeProvider(Now));

        await service.RebuildRateLimitedUsersAsync(CancellationToken.None);

        var users = ReadUsers(kvWriter);
        var until = users.GetProperty(limitedUser.ToString()).GetInt64();
        var expected = new DateTimeOffset(2026, 10, 30, 12, 0, 0, TimeSpan.Zero)
            .AddHours(25)
            .ToUnixTimeSeconds();
        Assert.Equal(expected, until);
        Assert.True(until > Now.ToUnixTimeSeconds());
    }

    [Fact]
    public async Task Rebuild_IncludesOnlyUsersOverTheCap()
    {
        var limitedUser = Guid.NewGuid();
        var quietUser = Guid.NewGuid();
        var repository = new CountingActivityRepository(new Dictionary<Guid, int>
        {
            [limitedUser] = 900,
            [quietUser] = 12
        });
        var kvWriter = new InMemoryKvWriter();
        var service = new RateLimitService(repository, kvWriter, new FixedTimeProvider(Now));

        await service.RebuildRateLimitedUsersAsync(CancellationToken.None);

        var users = ReadUsers(kvWriter);
        Assert.Equal(1, users.GetPropertyCount());
        Assert.True(users.TryGetProperty(limitedUser.ToString(), out _));
        Assert.False(users.TryGetProperty(quietUser.ToString(), out _));
    }

    [Fact]
    public async Task Rebuild_CountsTheLastTwentyFourHours()
    {
        var repository = new CountingActivityRepository(new Dictionary<Guid, int>());
        var service = new RateLimitService(repository, new InMemoryKvWriter(), new FixedTimeProvider(Now));

        await service.RebuildRateLimitedUsersAsync(CancellationToken.None);

        Assert.Equal(Now.AddHours(-24), repository.LastWindowStart);
    }

    [Fact]
    public async Task Rebuild_DoesNotRewriteAnUnchangedMap()
    {
        var limitedUser = Guid.NewGuid();
        var repository = new CountingActivityRepository(new Dictionary<Guid, int>
        {
            [limitedUser] = RateLimitService.DailyForwardingLimit + 1
        });
        var kvWriter = new InMemoryKvWriter();
        var service = new RateLimitService(repository, kvWriter, new FixedTimeProvider(Now));

        await service.RebuildRateLimitedUsersAsync(CancellationToken.None);
        var putsAfterFirst = kvWriter.Puts;
        await service.RebuildRateLimitedUsersAsync(CancellationToken.None);

        Assert.Equal(putsAfterFirst, kvWriter.Puts);
        Assert.True(kvWriter.Values.ContainsKey(RateLimitService.KvKey));
    }

    [Fact]
    public async Task Rebuild_DropsTheMapWhenTheLimitedSetEmpties()
    {
        var limitedUser = Guid.NewGuid();
        var repository = new CountingActivityRepository(new Dictionary<Guid, int>
        {
            [limitedUser] = RateLimitService.DailyForwardingLimit + 1
        });
        var kvWriter = new InMemoryKvWriter();
        var service = new RateLimitService(repository, kvWriter, new FixedTimeProvider(Now));

        await service.RebuildRateLimitedUsersAsync(CancellationToken.None);
        Assert.True(kvWriter.Values.ContainsKey(RateLimitService.KvKey));

        repository.Counts = new Dictionary<Guid, int> { [limitedUser] = 5 };
        await service.RebuildRateLimitedUsersAsync(CancellationToken.None);

        Assert.False(kvWriter.Values.ContainsKey(RateLimitService.KvKey));
    }

    [Fact]
    public async Task Rebuild_WhenTheKvWriteFails_DoesNotBreakIngest()
    {
        var repository = new CountingActivityRepository(new Dictionary<Guid, int>
        {
            [Guid.NewGuid()] = 600
        });
        var kvWriter = new InMemoryKvWriter { ShouldFail = true };
        var service = new RateLimitService(repository, kvWriter, new FixedTimeProvider(Now));

        await service.RebuildRateLimitedUsersAsync(CancellationToken.None);

        Assert.False(kvWriter.Values.ContainsKey(RateLimitService.KvKey));
    }

    private static JsonElement ReadUsers(InMemoryKvWriter kvWriter)
    {
        var json = kvWriter.Values[RateLimitService.KvKey];
        return JsonDocument.Parse(json).RootElement.GetProperty("users");
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }

    private sealed class CountingActivityRepository(IReadOnlyDictionary<Guid, int> counts) : IActivityRepository
    {
        public DateTimeOffset? LastWindowStart { get; private set; }

        public IReadOnlyDictionary<Guid, int> Counts { get; set; } = counts;

        public Task<Alias?> FindAliasForIngestAsync(string fullAddressHash, CancellationToken cancellationToken) => Task.FromResult<Alias?>(null);
        public Task<Alias?> FindAliasForIngestWithExpectedSendersAsync(string fullAddressHash, CancellationToken cancellationToken) => Task.FromResult<Alias?>(null);
        public Task<bool> MessageIdExistsAsync(Guid aliasId, string messageId, CancellationToken cancellationToken) =>
            Task.FromResult(false);

        public Task<Message> RecordMessageAsync(Message message, CancellationToken cancellationToken) => Task.FromResult(message);
        public Task<BlockedMessage> RecordBlockedMessageAsync(BlockedMessage blockedMessage, CancellationToken cancellationToken) => Task.FromResult(blockedMessage);
        public Task AddExpectedAddressSenderAsync(Guid aliasId, string senderAddress, string senderEtld1, DateTimeOffset createdAt, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task<IReadOnlyDictionary<Guid, int>> CountForwardedMessagesPerUserAsync(DateTimeOffset receivedAfter, CancellationToken cancellationToken)
        {
            LastWindowStart = receivedAfter;
            return Task.FromResult(Counts);
        }

        public Task<IReadOnlyList<Message>> ListMessagesAsync(Guid aliasId, DateTimeOffset receivedAfter, DateTimeOffset? beforeReceivedAt, Guid? beforeId, int limit, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<Message>>(Array.Empty<Message>());
        public Task<IReadOnlyList<BlockedMessage>> ListBlockedMessagesForUserAsync(Guid userId, Guid? aliasId, DateTimeOffset receivedAfter, DateTimeOffset? beforeReceivedAt, Guid? beforeId, int limit, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<BlockedMessage>>(Array.Empty<BlockedMessage>());
    }
}
