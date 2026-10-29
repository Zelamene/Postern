using System.Text.Json;
using Postern.Application.Activity;
using Postern.Application.Integrations;
using Postern.Domain.Activity;
using Postern.Domain.Aliases;
using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public class RateLimitMapRebuildTests
{
    [Fact]
    public async Task RebuildRateLimitedUsers_WhenUnderThreshold_WritesEmptyMap()
    {
        var repository = new InMemoryActivityRepository(100);
        var kvWriter = new InMemoryKvWriter();
        var service = new RateLimitService(repository, kvWriter);

        await service.RebuildRateLimitedUsersAsync(CancellationToken.None);

        Assert.True(kvWriter.Values.ContainsKey("rate_limited_users"));
        var json = kvWriter.Values["rate_limited_users"];
        var doc = JsonDocument.Parse(json);
        Assert.True(doc.RootElement.TryGetProperty("users", out var users));
        Assert.Equal(JsonValueKind.Object, users.ValueKind);
        Assert.Equal(0, users.GetPropertyCount());
    }

    [Fact]
    public async Task RebuildRateLimitedUsers_WhenAtThreshold_WritesEmptyMap()
    {
        var repository = new InMemoryActivityRepository(500);
        var kvWriter = new InMemoryKvWriter();
        var service = new RateLimitService(repository, kvWriter);

        await service.RebuildRateLimitedUsersAsync(CancellationToken.None);

        Assert.True(kvWriter.Values.ContainsKey("rate_limited_users"));
        var json = kvWriter.Values["rate_limited_users"];
        var doc = JsonDocument.Parse(json);
        var users = doc.RootElement.GetProperty("users");
        Assert.Equal(0, users.GetPropertyCount());
    }

    [Fact]
    public async Task RebuildRateLimitedUsers_WhenOverThreshold_WritesMapStructure()
    {
        var repository = new InMemoryActivityRepository(501);
        var kvWriter = new InMemoryKvWriter();
        var service = new RateLimitService(repository, kvWriter);

        await service.RebuildRateLimitedUsersAsync(CancellationToken.None);

        Assert.True(kvWriter.Values.ContainsKey("rate_limited_users"));
        var json = kvWriter.Values["rate_limited_users"];
        var doc = JsonDocument.Parse(json);
        Assert.True(doc.RootElement.TryGetProperty("users", out var users));
        Assert.Equal(JsonValueKind.Object, users.ValueKind);
    }

    [Fact]
    public async Task RebuildRateLimitedUsers_SerializesCorrectlyToKvWriter()
    {
        var repository = new InMemoryActivityRepository(100);
        var kvWriter = new InMemoryKvWriter();
        var service = new RateLimitService(repository, kvWriter);

        await service.RebuildRateLimitedUsersAsync(CancellationToken.None);

        var value = kvWriter.Values["rate_limited_users"];
        Assert.Contains("users", value);
    }

    private sealed class InMemoryActivityRepository(int count) : IActivityRepository
    {
        public Task<Alias?> FindAliasForIngestAsync(string fullAddressHash, CancellationToken cancellationToken) => Task.FromResult<Alias?>(null);
        public Task<Alias?> FindAliasForIngestWithExpectedSendersAsync(string fullAddressHash, CancellationToken cancellationToken) => Task.FromResult<Alias?>(null);
        public Task<Message> RecordMessageAsync(Message message, CancellationToken cancellationToken) => Task.FromResult(message);
        public Task<BlockedMessage> RecordBlockedMessageAsync(BlockedMessage blockedMessage, CancellationToken cancellationToken) => Task.FromResult(blockedMessage);
        public Task AddExpectedSenderAsync(Guid aliasId, string senderEtld1, DateTimeOffset createdAt, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task<int> CountForwardedMessagesLast24HoursAsync(CancellationToken cancellationToken) => Task.FromResult(count);
    }
}
