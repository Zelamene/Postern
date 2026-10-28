using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.Hosting;
using System.Net;
using System.Net.Http.Json;

namespace Postern.IntegrationTests;

public class HealthEndpointTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly WebApplicationFactory<Program> _factory;
    private readonly HttpClient _client;

    public HealthEndpointTests(WebApplicationFactory<Program> factory)
    {
        _factory = ConfigureFactory(factory, "Development");
        _client = _factory.CreateClient();
    }

    [Fact]
    public async Task HealthEndpointReturnsOkWithoutDatabaseSetup()
    {
        var response = await _client.GetAsync("/health");
        var body = await response.Content.ReadFromJsonAsync<HealthResponse>();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("ok", body?.Status);
    }

    [Fact]
    public async Task SwaggerIsAvailableInDevelopment()
    {
        using var factory = ConfigureFactory(new WebApplicationFactory<Program>(), "Development");
        using var client = factory.CreateClient();

        var uiResponse = await client.GetAsync("/swagger/index.html");
        var documentResponse = await client.GetAsync("/swagger/v1/swagger.json");

        Assert.Equal(HttpStatusCode.OK, uiResponse.StatusCode);
        Assert.Equal(HttpStatusCode.OK, documentResponse.StatusCode);
    }

    [Fact]
    public async Task SwaggerIsUnavailableOutsideDevelopment()
    {
        using var factory = ConfigureFactory(new WebApplicationFactory<Program>(), "Production");
        using var client = factory.CreateClient();

        var uiResponse = await client.GetAsync("/swagger/index.html");
        var documentResponse = await client.GetAsync("/swagger/v1/swagger.json");

        Assert.Equal(HttpStatusCode.NotFound, uiResponse.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, documentResponse.StatusCode);
    }

    private static WebApplicationFactory<Program> ConfigureFactory(
        WebApplicationFactory<Program> factory,
        string environment) =>
        factory.WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment(environment);
            builder.UseSetting(
                "Authentication:SigningKey",
                "integration-test-key-material-at-least-thirty-two-bytes");
            builder.UseSetting(
                "ConnectionStrings:Postgres",
                "Host=localhost;Database=postern;Username=postern_app;Password=test-only;Search Path=postern");
        });

    public void Dispose()
    {
        _client.Dispose();
        _factory.Dispose();
    }

    private sealed record HealthResponse(string Status);
}
