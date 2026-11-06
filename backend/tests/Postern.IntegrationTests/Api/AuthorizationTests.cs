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
        "/api/aliases/00000000-0000-0000-0000-000000000001/expected-senders",
        "/api/messages/blocked",
        "/api/admin/analytics",
        "/api/admin/global-blocklist",
        "/api/admin/invites",
        "/api/admin/invite-requests"
    };

    public static TheoryData<string, string> ProtectedMutationRoutes => new()
    {
        { "POST", "/api/auth/logout" },
        { "POST", "/api/aliases" },
        { "PATCH", "/api/aliases/00000000-0000-0000-0000-000000000001" },
        { "PATCH", "/api/aliases/00000000-0000-0000-0000-000000000001/disable" },
        { "DELETE", "/api/aliases/00000000-0000-0000-0000-000000000001" },
        { "POST", "/api/aliases/00000000-0000-0000-0000-000000000001/expected-senders" },
        { "POST", "/api/aliases/00000000-0000-0000-0000-000000000001/block-sender" },
        { "POST", "/api/users/change-forwarding-address" },
        { "DELETE", "/api/users/me" },
        { "POST", "/api/admin/kv-sync" },
        { "POST", "/api/admin/suspended-users/rebuild" },
        { "POST", "/api/admin/users/00000000-0000-0000-0000-000000000001/suspend" },
        { "POST", "/api/admin/global-blocklist" }
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

    [Theory]
    [MemberData(nameof(ProtectedMutationRoutes))]
    public async Task ProtectedMutationRoutes_RejectAnonymousCallers(string method, string route)
    {
        using var factory = ApiTestConfiguration.CreateFactory("Development");
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(new HttpMethod(method), route);

        var response = await client.SendAsync(request);

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
