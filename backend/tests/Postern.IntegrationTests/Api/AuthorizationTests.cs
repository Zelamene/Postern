using System.Net;
using Microsoft.AspNetCore.TestHost;
using Postern.Api.Security;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Api;

public sealed class AuthorizationTests
{
    public static TheoryData<string> ProtectedRoutes => new()
    {
        "/api/auth/me",
        "/api/aliases",
        "/api/aliases/00000000-0000-0000-0000-000000000001/messages",
        "/api/messages/blocked"
    };

    [Theory]
    [MemberData(nameof(ProtectedRoutes))]
    public async Task ProtectedRoutes_RejectAnonymousCallers(string route)
    {
        using var factory = ApiTestConfiguration.CreateFactory("Development");
        using var client = factory.CreateClient();

        var response = await client.GetAsync(route);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task ProtectedRoutes_RejectForgedTokens()
    {
        using var factory = ApiTestConfiguration.CreateFactory("Development");
        using var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add(
            "Cookie",
            $"{JwtTokenIssuer.CookieName}={PosternApiFactory.ForgedToken(Guid.NewGuid())}");

        var response = await client.GetAsync("/api/messages/blocked");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task DevelopmentDestinationEndpoints_AreNotMappedOutsideDevelopment()
    {
        using var factory = ApiTestConfiguration.CreateFactory("Production");
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/api/dev/destinations/user%40example.test/verify", null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
