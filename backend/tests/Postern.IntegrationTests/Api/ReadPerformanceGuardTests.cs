using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Api;

/// <summary>
/// QR2.2 coarse CI guard: dashboard reads on 50-item pages must stay well below the
/// 500 ms p95 NFR target in the disposable integration environment. This is not a
/// substitute for the recorded k6 measurement.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class ReadPerformanceGuardTests(PosternFixture fixture) : IAsyncLifetime
{
    private const int PageSize = 50;
    // Coarse bound to catch regressions in CI without flakiness; NFR target is 500 ms p95.
    private static readonly TimeSpan CoarseBudget = TimeSpan.FromMilliseconds(1500);

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
    public async Task Messages_FirstPageOfFifty_CompletesWithinCoarseBudget()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        var now = DateTimeOffset.UtcNow;
        for (var index = 0; index < 60; index++)
        {
            await fixture.AMessageAsync(alias.Id, now.AddMinutes(-index), $"perf message {index}");
        }

        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var stopwatch = Stopwatch.StartNew();
        var response = await client.GetAsync($"/api/aliases/{alias.Id}/messages?limit={PageSize}");
        stopwatch.Stop();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var page = await response.Content.ReadFromJsonAsync<ActivityPage<MessageBody>>();
        Assert.NotNull(page);
        Assert.Equal(PageSize, page.Items.Count);
        Assert.NotNull(page.NextCursor);
        Assert.True(
            stopwatch.Elapsed <= CoarseBudget,
            $"GET messages took {stopwatch.Elapsed.TotalMilliseconds:F1} ms (budget {CoarseBudget.TotalMilliseconds:F0} ms).");
    }

    [Fact]
    public async Task BlockedMessages_FirstPageOfFifty_CompletesWithinCoarseBudget()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        var now = DateTimeOffset.UtcNow;
        for (var index = 0; index < 60; index++)
        {
            await fixture.ABlockedMessageAsync(alias.Id, now.AddMinutes(-index), subject: $"perf blocked {index}");
        }

        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var stopwatch = Stopwatch.StartNew();
        var response = await client.GetAsync($"/api/messages/blocked?limit={PageSize}");
        stopwatch.Stop();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var page = await response.Content.ReadFromJsonAsync<ActivityPage<BlockedMessageBody>>();
        Assert.NotNull(page);
        Assert.Equal(PageSize, page.Items.Count);
        Assert.NotNull(page.NextCursor);
        Assert.True(
            stopwatch.Elapsed <= CoarseBudget,
            $"GET blocked messages took {stopwatch.Elapsed.TotalMilliseconds:F1} ms (budget {CoarseBudget.TotalMilliseconds:F0} ms).");
    }

    private sealed record ActivityPage<T>(IReadOnlyList<T> Items, string? NextCursor);

    private sealed record MessageBody(Guid Id);

    private sealed record BlockedMessageBody(Guid Id);
}
