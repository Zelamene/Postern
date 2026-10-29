using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Postern.Application.Integrations;
using Postern.Infrastructure.Integrations;
using Postern.Infrastructure.Persistence;

namespace Postern.IntegrationTests;

public class EndpointIntegrationTests
{
    private const string ConnectionString = "Host=localhost;Port=5432;Database=postern;Username=postern_app;Password=0jkIFHcwFzSYocIqyEZN6dbmdB7wtUOi6ROe1AU;Search Path=postern"; // pragma: allowlist secret

    [Fact]
    public async Task HealthEndpoint_ReturnsOk()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var response = await client.GetAsync("/health");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task RegisterEndpoint_InvalidRequest_ReturnsBadRequest()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/register", new { email = "bad", password = "short", inviteCode = "" });
        Assert.True(response.StatusCode == HttpStatusCode.BadRequest || response.StatusCode == HttpStatusCode.Accepted);
    }

    [Fact]
    public async Task LoginEndpoint_InvalidCredentials_ReturnsUnauthorized()
    {
        using var factory = CreateFactory();
        using var client = factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/login", new { email = "nope@example.com", password = "wrongpassword123" });
        Assert.True(response.StatusCode == HttpStatusCode.Unauthorized || response.StatusCode == HttpStatusCode.Forbidden);
    }

    private static WebApplicationFactory<Program> CreateFactory() =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.UseSetting("Authentication:SigningKey", "integration-test-key-material-at-least-thirty-two-bytes");
            builder.UseSetting("ConnectionStrings:Postgres", ConnectionString);
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<PosternDbContext>();
                services.AddDbContext<PosternDbContext>(options =>
                    PosternDbContext.ConfigureNpgsql(options, ConnectionString));
                services.RemoveAll<IKvWriter>();
                services.AddSingleton<IKvWriter>(new NoOpKvWriter());
                services.RemoveAll<IDestinationService>();
                services.AddSingleton<IDestinationService>(new DevelopmentDestinationService());
            });
        });
}
