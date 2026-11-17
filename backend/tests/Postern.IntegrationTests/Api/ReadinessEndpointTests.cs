using System.Net;
using System.Net.Http.Json;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Api;

[Collection(IntegrationCollection.Name)]
public sealed class ReadinessEndpointTests(PosternFixture fixture) : IAsyncLifetime
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
    public async Task Readiness_ReturnsReady_WhenTheDatabaseAnswers()
    {
        using var client = _factory.CreateClient();

        var response = await client.GetAsync("/health/ready");
        var body = await response.Content.ReadFromJsonAsync<ReadinessResponse>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("ready", body?.Status);
    }

    private sealed record ReadinessResponse(string Status);
}
