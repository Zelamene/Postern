using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Postern.IntegrationTests.Api;

public sealed class HealthEndpointTests
{
    [Fact]
    public async Task HealthEndpoint_ReturnsOk_WithoutDatabaseAccess()
    {
        using var factory = ApiTestConfiguration.CreateFactory("Development");
        using var client = factory.CreateClient();

        var response = await client.GetAsync("/health");
        var body = await response.Content.ReadFromJsonAsync<HealthResponse>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("ok", body?.Status);
    }

    [Fact]
    public async Task Swagger_IsAvailableInDevelopment()
    {
        using var factory = ApiTestConfiguration.CreateFactory("Development");
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/swagger/index.html")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/swagger/v1/swagger.json")).StatusCode);
    }

    [Fact]
    public async Task Swagger_IsUnavailableOutsideDevelopment()
    {
        using var factory = ApiTestConfiguration.CreateFactory("Production");
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/swagger/index.html")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/swagger/v1/swagger.json")).StatusCode);
    }

    [Fact]
    public void Api_RefusesToStart_WithoutSigningKey()
    {
        using var factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.UseSetting("Authentication:SigningKey", "too-short");
            builder.UseSetting("ConnectionStrings:Postgres", ApiTestConfiguration.UnusedConnectionString);
        });

        Assert.ThrowsAny<Exception>(() => factory.CreateClient());
    }

    private sealed record HealthResponse(string Status);
}

internal static class ApiTestConfiguration
{
    public const string UnusedConnectionString =
        "Host=localhost;Database=postern;Username=postern_app;Password=unused;Search Path=postern"; // pragma: allowlist secret

    public static WebApplicationFactory<Program> CreateFactory(string environment) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(environment);
            builder.UseSetting(
                "Authentication:SigningKey",
                "integration-test-key-material-at-least-thirty-two-bytes");
            builder.UseSetting("ConnectionStrings:Postgres", UnusedConnectionString);
        });
}
