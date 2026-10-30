using System.Net;
using System.Net.Http.Json;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Modules;

[Collection(IntegrationCollection.Name)]
public sealed class ActivityEndpointsTests(PosternFixture fixture) : IAsyncLifetime
{
    private PosternApiFactory _factory = null!;

    public Task InitializeAsync()
    {
        _factory = new PosternApiFactory(fixture);
        return Task.CompletedTask;
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task Messages_AreNewestFirst()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        var now = DateTimeOffset.UtcNow;
        var oldest = await fixture.AMessageAsync(alias.Id, now.AddMinutes(-30), "oldest");
        var middle = await fixture.AMessageAsync(alias.Id, now.AddMinutes(-20), "middle");
        var newest = await fixture.AMessageAsync(alias.Id, now.AddMinutes(-10), "newest");

        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);
        var page = await GetMessagesAsync(client, alias.Id);

        Assert.Equal(
            new[] { newest.Id, middle.Id, oldest.Id },
            page.Items.Select(item => item.Id));
        Assert.Null(page.NextCursor);
    }

    [Fact]
    public async Task Messages_PageThroughEveryRowExactlyOnce()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        var now = DateTimeOffset.UtcNow;
        for (var index = 0; index < 5; index++)
        {
            await fixture.AMessageAsync(alias.Id, now.AddMinutes(-index), $"message {index}");
        }

        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);
        var seen = new List<Guid>();
        string? cursor = null;
        var pages = 0;

        do
        {
            var page = await GetMessagesAsync(client, alias.Id, limit: 2, cursor: cursor);
            seen.AddRange(page.Items.Select(item => item.Id));
            cursor = page.NextCursor;
            pages++;
        }
        while (cursor is not null && pages < 10);

        Assert.Equal(5, seen.Count);
        Assert.Equal(5, seen.Distinct().Count());
        Assert.Equal(3, pages);
        Assert.Null(cursor);
    }

    [Fact]
    public async Task Messages_WithEqualTimestamps_AreNotSkippedOrDuplicated()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        var receivedAt = DateTimeOffset.UtcNow.AddMinutes(-5);
        for (var index = 0; index < 3; index++)
        {
            await fixture.AMessageAsync(alias.Id, receivedAt, $"tie {index}");
        }

        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);
        var seen = new List<Guid>();
        string? cursor = null;
        var pages = 0;

        do
        {
            var page = await GetMessagesAsync(client, alias.Id, limit: 1, cursor: cursor);
            seen.AddRange(page.Items.Select(item => item.Id));
            cursor = page.NextCursor;
            pages++;
        }
        while (cursor is not null && pages < 10);

        Assert.Equal(3, seen.Count);
        Assert.Equal(3, seen.Distinct().Count());
    }

    [Fact]
    public async Task Messages_ExcludeRowsOutsideRetentionWindow()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        var inside = await fixture.AMessageAsync(alias.Id, DateTimeOffset.UtcNow.AddDays(-89));
        await fixture.AMessageAsync(alias.Id, DateTimeOffset.UtcNow.AddDays(-91));

        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);
        var page = await GetMessagesAsync(client, alias.Id);

        var item = Assert.Single(page.Items);
        Assert.Equal(inside.Id, item.Id);
    }

    [Fact]
    public async Task Messages_ExcludeOtherAliasesOfTheSameUser()
    {
        var user = await fixture.AUserAsync();
        var mine = await fixture.AnAliasAsync(user.Id, label: "mine");
        var other = await fixture.AnAliasAsync(user.Id, label: "other");
        await fixture.AMessageAsync(mine.Id, subject: "for mine");
        await fixture.AMessageAsync(other.Id, subject: "for other");

        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);
        var page = await GetMessagesAsync(client, mine.Id);

        var item = Assert.Single(page.Items);
        Assert.Equal(mine.Id, item.AliasId);
        Assert.Equal("for mine", item.Subject);
    }

    [Fact]
    public async Task Messages_ForForeignAlias_ReturnNotFound()
    {
        var owner = await fixture.AUserAsync();
        var stranger = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(owner.Id);
        await fixture.AMessageAsync(alias.Id);

        using var client = _factory.CreateAuthenticatedClient(stranger.Id, stranger.Email);
        var response = await client.GetAsync($"/api/aliases/{alias.Id}/messages");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Messages_ForUnknownAlias_ReturnNotFound()
    {
        var user = await fixture.AUserAsync();

        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);
        var response = await client.GetAsync($"/api/aliases/{Guid.NewGuid()}/messages");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task Messages_WithMalformedCursor_ReturnBadRequest()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);

        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);
        var response = await client.GetAsync($"/api/aliases/{alias.Id}/messages?cursor=not-a-cursor");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task Messages_ClampPageSizeToMaximum()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        var now = DateTimeOffset.UtcNow;
        for (var index = 0; index < 3; index++)
        {
            await fixture.AMessageAsync(alias.Id, now.AddMinutes(-index));
        }

        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);
        var page = await GetMessagesAsync(client, alias.Id, limit: 10_000);

        Assert.Equal(3, page.Items.Count);
        Assert.Null(page.NextCursor);
    }

    [Fact]
    public async Task Messages_ExposeFlaggedSenderReason()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        await fixture.AMessageAsync(
            alias.Id,
            subject: "unexpected",
            isFlagged: true,
            flagReason: "unexpected_pass");

        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);
        var page = await GetMessagesAsync(client, alias.Id);

        var item = Assert.Single(page.Items);
        Assert.True(item.IsFlagged);
        Assert.Equal("unexpected_pass", item.FlagReason);
    }

    [Fact]
    public async Task BlockedMessages_AreScopedToTheOwner()
    {
        var owner = await fixture.AUserAsync();
        var stranger = await fixture.AUserAsync();
        var firstAlias = await fixture.AnAliasAsync(owner.Id, label: "first");
        var secondAlias = await fixture.AnAliasAsync(owner.Id, label: "second");
        var foreignAlias = await fixture.AnAliasAsync(stranger.Id, label: "foreign");
        await fixture.ABlockedMessageAsync(firstAlias.Id, subject: "first blocked");
        var second = await fixture.ABlockedMessageAsync(secondAlias.Id, subject: "second blocked");
        await fixture.ABlockedMessageAsync(foreignAlias.Id, subject: "not mine");

        using var client = _factory.CreateAuthenticatedClient(owner.Id, owner.Email);
        var page = await GetBlockedAsync(client);

        Assert.Equal(2, page.Items.Count);
        Assert.DoesNotContain(page.Items, item => item.AliasId == foreignAlias.Id);
        Assert.Contains(page.Items, item => item.Id == second.Id);
    }

    [Fact]
    public async Task BlockedMessages_CanBeFilteredToOneAlias()
    {
        var user = await fixture.AUserAsync();
        var firstAlias = await fixture.AnAliasAsync(user.Id, label: "first");
        var secondAlias = await fixture.AnAliasAsync(user.Id, label: "second");
        var expected = await fixture.ABlockedMessageAsync(firstAlias.Id);
        await fixture.ABlockedMessageAsync(secondAlias.Id);

        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);
        var page = await GetBlockedAsync(client, firstAlias.Id);

        var item = Assert.Single(page.Items);
        Assert.Equal(expected.Id, item.Id);
        Assert.Equal("unexpected_sender", item.Reason);
    }

    [Fact]
    public async Task BlockedMessages_ForForeignAliasFilter_ReturnNotFound()
    {
        var owner = await fixture.AUserAsync();
        var stranger = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(owner.Id);

        using var client = _factory.CreateAuthenticatedClient(stranger.Id, stranger.Email);
        var response = await client.GetAsync($"/api/messages/blocked?aliasId={alias.Id}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task BlockedMessages_ExcludeRowsOutsideRetentionWindow()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        var inside = await fixture.ABlockedMessageAsync(alias.Id, DateTimeOffset.UtcNow.AddDays(-89));
        await fixture.ABlockedMessageAsync(alias.Id, DateTimeOffset.UtcNow.AddDays(-91));

        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);
        var page = await GetBlockedAsync(client);

        var item = Assert.Single(page.Items);
        Assert.Equal(inside.Id, item.Id);
    }

    private static async Task<ActivityPage<MessageBody>> GetMessagesAsync(
        HttpClient client,
        Guid aliasId,
        int? limit = null,
        string? cursor = null)
    {
        var url = $"/api/aliases/{aliasId}/messages";
        var query = new List<string>();
        if (limit is not null)
        {
            query.Add($"limit={limit}");
        }

        if (cursor is not null)
        {
            query.Add($"cursor={Uri.EscapeDataString(cursor)}");
        }

        if (query.Count > 0)
        {
            url += "?" + string.Join('&', query);
        }

        var response = await client.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ActivityPage<MessageBody>>())!;
    }

    private static async Task<ActivityPage<BlockedMessageBody>> GetBlockedAsync(
        HttpClient client,
        Guid? aliasId = null)
    {
        var url = "/api/messages/blocked";
        if (aliasId is not null)
        {
            url += $"?aliasId={aliasId}";
        }

        var response = await client.GetAsync(url);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ActivityPage<BlockedMessageBody>>())!;
    }

    private sealed record ActivityPage<T>(IReadOnlyList<T> Items, string? NextCursor);

    private sealed record MessageBody(
        Guid Id,
        Guid AliasId,
        string FromHeader,
        string EnvelopeSender,
        string? Subject,
        DateTimeOffset ReceivedAt,
        string AuthenticationResult,
        bool IsFlagged,
        string? FlagReason);

    private sealed record BlockedMessageBody(
        Guid Id,
        Guid AliasId,
        string FromHeader,
        string? Subject,
        DateTimeOffset ReceivedAt,
        string Reason);
}
