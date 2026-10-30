using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Postern.Api.Security;
using Postern.Application.Accounts;
using Postern.Application.Integrations;
using Postern.Infrastructure.Integrations;
using Postern.Infrastructure.Persistence;

namespace Postern.IntegrationTests.Fixtures;

public sealed class PosternApiFactory : WebApplicationFactory<Program>
{
    public const string SigningKey = "integration-test-key-material-at-least-thirty-two-bytes";
    private const string Issuer = "Postern";
    private const string Audience = "Postern.Web";

    private readonly PosternFixture _fixture;

    public PosternApiFactory(PosternFixture fixture) => _fixture = fixture;

    public DevelopmentDestinationService Destinations =>
        (DevelopmentDestinationService)Services.GetRequiredService<IDestinationService>();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("Authentication:SigningKey", SigningKey);
        builder.UseSetting("Authentication:Issuer", Issuer);
        builder.UseSetting("Authentication:Audience", Audience);
        builder.UseSetting("ConnectionStrings:Postgres", _fixture.ConnectionString);
        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<PosternDbContext>();
            services.AddDbContext<PosternDbContext>(options =>
                PosternDbContext.ConfigureNpgsql(options, _fixture.ConnectionString));
            services.RemoveAll<IKvWriter>();
            services.AddSingleton<IKvWriter>(new NoOpKvWriter());
            services.RemoveAll<IDestinationService>();
            services.AddSingleton<IDestinationService>(new DevelopmentDestinationService());
        });
    }

    public HttpClient CreateAuthenticatedClient(Guid userId, string email = "user@example.test", bool isAdmin = false)
    {
        var client = CreateClient();
        using var scope = Services.CreateScope();
        var issuer = scope.ServiceProvider.GetRequiredService<JwtTokenIssuer>();
        var token = issuer.Issue(new AuthenticatedAccount(userId, email, isAdmin, null));
        client.DefaultRequestHeaders.Add("Cookie", $"{JwtTokenIssuer.CookieName}={token}");
        return client;
    }

    public static string ForgedToken(Guid userId)
    {
        var handler = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler();
        var token = new System.IdentityModel.Tokens.Jwt.JwtSecurityToken(
            Issuer,
            Audience,
            [new Claim(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub, userId.ToString())],
            DateTime.UtcNow,
            DateTime.UtcNow.AddHours(1),
            new Microsoft.IdentityModel.Tokens.SigningCredentials(
                new Microsoft.IdentityModel.Tokens.SymmetricSecurityKey(
                    Encoding.UTF8.GetBytes("a-different-signing-key-of-sufficient-length!!")),
                Microsoft.IdentityModel.Tokens.SecurityAlgorithms.HmacSha256));
        return handler.WriteToken(token);
    }
}
