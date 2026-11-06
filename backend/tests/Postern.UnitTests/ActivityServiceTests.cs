using Postern.Application.Activity;
using Postern.Application.Aliases;
using Postern.Domain.Activity;
using Postern.Domain.Aliases;
using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public class ActivityServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 1, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task ListMessages_WhenAliasNotOwned_ReturnsNull()
    {
        var aliases = new InMemoryAliasRepository();
        var activity = new InMemoryActivityRepository();
        var service = new ActivityService(activity, aliases, new FixedTimeProvider(Now));

        var page = await service.ListMessagesAsync(Guid.NewGuid(), Guid.NewGuid(), 25, null, CancellationToken.None);

        Assert.Null(page);
    }

    [Fact]
    public async Task ListMessages_ReturnsPageWithNextCursor()
    {
        var userId = Guid.NewGuid();
        var aliasId = Guid.NewGuid();
        var aliases = new InMemoryAliasRepository();
        aliases.Seed(new Alias { Id = aliasId, UserId = userId, FullAddressHash = "h", Status = AliasStatus.Active, CreatedAt = Now });
        var activity = new InMemoryActivityRepository();
        for (var i = 0; i < 3; i++)
        {
            activity.Messages.Add(new Message { Id = Guid.NewGuid(), AliasId = aliasId, FromHeader = "f", EnvelopeSender = "e", ReceivedAt = Now.AddMinutes(-i), AuthenticationResult = "pass" });
        }
        var service = new ActivityService(activity, aliases, new FixedTimeProvider(Now));

        var page = await service.ListMessagesAsync(userId, aliasId, 2, null, CancellationToken.None);

        Assert.NotNull(page);
        Assert.Equal(2, page.Items.Count);
        Assert.NotNull(page.NextCursor);
        Assert.True(ActivityCursor.TryDecode(page.NextCursor, out _));
    }

    [Fact]
    public async Task ListBlockedMessages_WhenAliasNotOwned_ReturnsNull()
    {
        var aliases = new InMemoryAliasRepository();
        var activity = new InMemoryActivityRepository();
        var service = new ActivityService(activity, aliases, new FixedTimeProvider(Now));

        var page = await service.ListBlockedMessagesAsync(Guid.NewGuid(), Guid.NewGuid(), 25, null, CancellationToken.None);

        Assert.Null(page);
    }

    [Fact]
    public async Task ListBlockedMessages_WithoutAliasFilter_ReturnsUserPage()
    {
        var userId = Guid.NewGuid();
        var aliasId = Guid.NewGuid();
        var aliases = new InMemoryAliasRepository();
        aliases.Seed(new Alias { Id = aliasId, UserId = userId, FullAddressHash = "h", Status = AliasStatus.Active, CreatedAt = Now });
        var activity = new InMemoryActivityRepository();
        activity.AddAlias(new Alias { Id = aliasId, UserId = userId, FullAddressHash = "h", Status = AliasStatus.Active, CreatedAt = Now });
        activity.BlockedMessages.Add(new BlockedMessage { Id = Guid.NewGuid(), AliasId = aliasId, FromHeader = "f", ReceivedAt = Now, Reason = "test" });
        var service = new ActivityService(activity, aliases, new FixedTimeProvider(Now));

        var page = await service.ListBlockedMessagesAsync(userId, null, 25, null, CancellationToken.None);

        Assert.NotNull(page);
        Assert.Single(page.Items);
        Assert.Null(page.NextCursor);
    }

    [Theory]
    [InlineData(null, 25)]
    [InlineData(0, 25)]
    [InlineData(-1, 25)]
    [InlineData(50, 50)]
    [InlineData(500, 100)]
    public void NormalizePageSize_Clamps(int? requested, int expected)
    {
        Assert.Equal(expected, ActivityService.NormalizePageSize(requested));
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
