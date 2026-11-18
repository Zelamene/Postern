using System.Net;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Metadata;
using Microsoft.AspNetCore.Routing;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Api;

/// <summary>
/// QR1.1: every administrative route must reject callers without an admin session.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class AdminRouteInventoryTests(PosternFixture fixture) : IAsyncLifetime
{

    private static readonly HashSet<string> ExemptFromOpenApi = new(StringComparer.OrdinalIgnoreCase)
    {
        "/api/admin/events",
        "/api/admin/events/negotiate",
    };

    private PosternApiFactory _factory = null!;
    private List<AdminRoute> _routes = [];

    public Task InitializeAsync()
    {
        _factory = new PosternApiFactory(fixture);
        _routes = ReadAdminRoutes();
        return Task.CompletedTask;
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
    public async Task EveryAdministrativeEndpoint_AppearsInOpenApiOrIsExempt()
    {
        var described = await ReadOpenApiRoutesAsync();

        var undescribed = _routes
            .Where(route => !described.Contains($"{route.Method} {route.Url}"))
            .Where(route => !ExemptFromOpenApi.Contains(route.Url))
            .Select(route => $"{route.Method} {route.Url}")
            .ToList();

        Assert.True(
            undescribed.Count == 0,
            "These administrative endpoints are mapped but neither described in OpenAPI nor "
            + "listed as an OpenAPI exemption, so no reviewer or client can discover them: "
            + string.Join(", ", undescribed));
    }

    [Fact]
    public void EveryAdministrativeRoute_IsDeclaredInTheAuditContract()
    {
        var contract = ReadAuditContract();
        var mapped = _routes

            .Where(route => !ExemptFromOpenApi.Contains(route.Url))
            .Select(route => $"{route.Method} {route.Url}")
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var undeclared = mapped
            .Where(route => !contract.Contains(route))
            .Order()
            .ToList();
        Assert.True(
            undeclared.Count == 0,
            "These administrative routes have no audit-event declaration, so nobody can say what "
            + "they record. Declare them in shared/admin-audit-events.json: "
            + string.Join(", ", undeclared));

        var stale = contract
            .Where(route => !mapped.Contains(route))
            .Order()
            .ToList();
        Assert.True(
            stale.Count == 0,
            "The audit contract declares routes that are no longer mapped: "
            + string.Join(", ", stale));
    }

    [Fact]
    public async Task AnonymousRequests_AreRejectedByEveryAdministrativeRoute()
    {
        using var client = _factory.CreateClient();

        foreach (var route in _routes)
        {
            using var request = new HttpRequestMessage(new HttpMethod(route.Method), route.RequestUrl);
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
            using var request = new HttpRequestMessage(new HttpMethod(route.Method), route.RequestUrl);
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

    private List<AdminRoute> ReadAdminRoutes() =>
        _factory.Endpoints
            .OfType<RouteEndpoint>()
            .SelectMany(endpoint => MethodsFor(endpoint)
                .Select(method => new AdminRoute(
                    method,
                    CanonicalPath(endpoint.RoutePattern.RawText),
                    RequestPath(endpoint.RoutePattern.RawText))))
            .Where(route => route.Url.StartsWith("/api/admin", StringComparison.OrdinalIgnoreCase))
            .DistinctBy(route => $"{route.Method} {route.Url}", StringComparer.OrdinalIgnoreCase)
            .OrderBy(route => route.Url, StringComparer.Ordinal)
            .ThenBy(route => route.Method, StringComparer.Ordinal)
            .ToList();


    private static string CanonicalPath(string? rawText)
    {
        var path = "/" + (rawText ?? string.Empty).TrimStart('/');
        path = Regex.Replace(path, @"\{[^}]+\}", "*");
        return path.Length > 1 ? path.TrimEnd('/') : path;
    }

    /// <summary>
    /// A requestable form of a route, used only by the rejection sweeps.
    /// </summary>
    private static string RequestPath(string? rawText) =>
        Regex.Replace(
            "/" + (rawText ?? string.Empty).TrimStart('/'),
            @"\{([^}]+)\}",
            match => match.Groups[1].Value.Contains("domain", StringComparison.OrdinalIgnoreCase)
                ? "example.test"
                : Guid.NewGuid().ToString());

    private static IEnumerable<string> MethodsFor(RouteEndpoint endpoint)
    {
        var metadata = endpoint.Metadata.GetMetadata<HttpMethodMetadata>();
        return metadata is { HttpMethods.Count: > 0 } ? metadata.HttpMethods : ["GET"];
    }

    private async Task<HashSet<string>> ReadOpenApiRoutesAsync()
    {
        using var client = _factory.CreateClient();
        using var document = JsonDocument.Parse(
            await client.GetStringAsync("/swagger/v1/swagger.json"));

        var routes = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (!document.RootElement.TryGetProperty("paths", out var paths))
        {
            return routes;
        }

        foreach (var path in paths.EnumerateObject())
        {
            var url = CanonicalPath(path.Name);
            foreach (var operation in path.Value.EnumerateObject())
            {
                var method = operation.Name.ToUpperInvariant();
                if (method is "GET" or "POST" or "PUT" or "PATCH" or "DELETE")
                {
                    routes.Add($"{method} {url}");
                }
            }
        }

        return routes;
    }

    private static HashSet<string> ReadAuditContract()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null
            && !File.Exists(Path.Combine(directory.FullName, "shared", "admin-audit-events.json")))
        {
            directory = directory.Parent;
        }

        Assert.NotNull(directory);
        using var document = JsonDocument.Parse(
            File.ReadAllText(Path.Combine(directory!.FullName, "shared", "admin-audit-events.json")));

        return document.RootElement
            .GetProperty("routes")
            .EnumerateObject()
            .Select(route =>
            {
                var separator = route.Name.IndexOf(' ');
                var method = route.Name[..separator].ToUpperInvariant();
                var path = CanonicalPath(route.Name[(separator + 1)..]);
                return $"{method} {path}";
            })
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    private sealed record AdminRoute(string Method, string Url, string RequestUrl);
}
