using System.Net;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Modules;

[Collection(IntegrationCollection.Name)]
public sealed class UserRealtimeHubTests(PosternFixture fixture)
{
    [Fact]
    public async Task HubRejectsUnauthenticatedConnections()
    {
        using var factory = new PosternApiFactory(fixture);
        using var client = factory.CreateClient();

        using var response = await client.PostAsync(
            "/api/user/events/negotiate?negotiateVersion=1",
            content: null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task HubAcceptsAuthenticatedRegularUsers()
    {
        using var factory = new PosternApiFactory(fixture);
        var user = await fixture.AUserAsync();
        using var client = factory.CreateAuthenticatedClient(user.Id, user.Email);

        using var response = await client.PostAsync(
            "/api/user/events/negotiate?negotiateVersion=1",
            content: null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
