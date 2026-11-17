using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Api;


[Collection(IntegrationCollection.Name)]
public sealed class AdminRouteInventoryTests(PosternFixture fixture) : IAsyncLifetime
{
    private PosternApiFactory _factory = null!;
    private List<AdminRoute> _routes = [];

    public async Task InitializeAsync()
    {
        _factory = new PosternApiFactory(fixture);
        _routes = await ReadAdminRoutesAsync();
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public void Inventory_ContainsTheAdministrativeRoutes()
    {
        Assert.True(
            _routes.Count >= 10,
            $"The administrative route inventory found {_routes.Count} routes; expected at least 10.");
        Assert.Contains(_routes, route => route.Url == "/api/admin/kv-sync");
        Assert.Contains(_routes, route => route.Url.StartsWith("/api/admin/global-blocklist"));
    }

    [Fact]
    public async Task AnonymousRequests_AreRejectedByEveryAdministrativeRoute()
    {
        using var client = _factory.CreateClient();

        foreach (var route in _routes)
        {
            using var request = new HttpRequestMessage(new HttpMethod(route.Method), route.Url);
            using var response = await client.SendAsync(request);

            Assert.True(
                response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden,
                $"{route.Method} {route.Url} answered {(int)response.StatusCode} for an anonymous request.");
        }
    }

    [Fact]
    public async Task StandardUserRequests_AreRejectedByEveryAdministrativeRoute()
    {
        var user = await fixture.AUserAsync();
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        foreach (var route in _routes)
        {
            using var request = new HttpRequestMessage(new HttpMethod(route.Method), route.Url);
            using var response = await client.SendAsync(request);

            Assert.True(
                response.StatusCode is HttpStatusCode.Forbidden or HttpStatusCode.Unauthorized,
                $"{route.Method} {route.Url} answered {(int)response.StatusCode} for a non-admin session.");
        }
    }

    [Fact]
    public async Task AdminEventsHub_RejectsAnonymousRequests()
    {
        using var client = _factory.CreateClient();

        using var response = await client.GetAsync("/api/admin/events");

        Assert.True(
            response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden,
            $"The admin hub answered {(int)response.StatusCode} for an anonymous request.");
    }

    private async Task<List<AdminRoute>> ReadAdminRoutesAsync()
    {
        using var client = _factory.CreateClient();
        using var document = JsonDocument.Parse(
            await client.GetStringAsync("/swagger/v1/swagger.json"));

        if (!document.RootElement.TryGetProperty("paths", out var paths))
        {
            return [];
        }

        var routes = new List<AdminRoute>();
        foreach (var path in paths.EnumerateObject())
        {
            if (!path.Name.StartsWith("/api/admin", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var url = ReplaceParameters(path.Name);
            foreach (var operation in path.Value.EnumerateObject())
            {
                var method = operation.Name.ToUpperInvariant();
                if (method is "GET" or "POST" or "PUT" or "PATCH" or "DELETE")
                {
                    routes.Add(new AdminRoute(method, url));
                }
            }
        }

        return routes
            .DistinctBy(route => $"{route.Method} {route.Url}", StringComparer.OrdinalIgnoreCase)
            .OrderBy(route => route.Url, StringComparer.Ordinal)
            .ThenBy(route => route.Method, StringComparer.Ordinal)
            .ToList();
    }

    private static string ReplaceParameters(string path) =>
        Regex.Replace(
            path,
            @"\{([^}]+)\}",
            match => match.Groups[1].Value.Contains("domain", StringComparison.OrdinalIgnoreCase)
                ? "example.test"
                : Guid.NewGuid().ToString());

    private sealed record AdminRoute(string Method, string Url);
}
