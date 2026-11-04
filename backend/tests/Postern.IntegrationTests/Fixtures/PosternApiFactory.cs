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
    private readonly IKvWriter _kvWriter;
    private readonly string? _ingestSecret;
    private readonly string? _resendWebhookSecret;
    private readonly bool _enableInviteWorker;
    private readonly bool _configureInviteWorker;
    private readonly IInviteEmailSender? _inviteEmailSender;

    public PosternApiFactory(
        PosternFixture fixture,
        IKvWriter? kvWriter = null,
        string? ingestSecret = null,
        string? resendWebhookSecret = null,
        bool enableInviteWorker = false,
        IInviteEmailSender? inviteEmailSender = null,
        bool configureInviteWorker = false)
    {
        _fixture = fixture;
        _kvWriter = kvWriter ?? new NoOpKvWriter();
        _ingestSecret = ingestSecret;
        _resendWebhookSecret = resendWebhookSecret;
        _enableInviteWorker = enableInviteWorker;
        _configureInviteWorker = configureInviteWorker;
        _inviteEmailSender = inviteEmailSender;
    }

    public DevelopmentDestinationService Destinations =>
        (DevelopmentDestinationService)Services.GetRequiredService<IDestinationService>();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(_enableInviteWorker ? "Production" : "Development");
        builder.UseSetting("Authentication:SigningKey", SigningKey);
        builder.UseSetting("Authentication:Issuer", Issuer);
        builder.UseSetting("Authentication:Audience", Audience);
        builder.UseSetting("ConnectionStrings:Postgres", _fixture.ConnectionString);
        builder.UseSetting(
            "Invites:WorkerEnabled",
            (_enableInviteWorker || _configureInviteWorker).ToString());
        builder.UseSetting("Resend:From", "Postern <invites@example.test>");
        builder.UseSetting(
            "Invites:PublicBaseUrl",
            _enableInviteWorker ? "https://postern.example.test" : "http://localhost:5173");
        if (_enableInviteWorker)
        {
            builder.UseSetting("Ingest:SharedSecret", "integration-test-ingest-secret");
            builder.UseSetting("Resend:WebhookSecret", "integration-test-webhook-secret");
            builder.UseSetting(
                "DataProtection:KeysPath",
                Path.Combine(Path.GetTempPath(), $"postern-api-test-keys-{Environment.ProcessId}"));
        }
        if (_ingestSecret is not null)
        {
            builder.UseSetting("Ingest:SharedSecret", _ingestSecret);
        }
        builder.UseSetting(
            "Resend:ApiKey",
            _enableInviteWorker || _configureInviteWorker ? "integration-test-api-key" : string.Empty);
        if (_resendWebhookSecret is not null)
        {
            builder.UseSetting("Resend:WebhookSecret", _resendWebhookSecret);
        }

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<PosternDbContext>();
            services.AddDbContext<PosternDbContext>(options =>
                PosternDbContext.ConfigureNpgsql(options, _fixture.ConnectionString));
            services.RemoveAll<IKvWriter>();
            services.AddSingleton(_kvWriter);
            services.RemoveAll<IDestinationService>();
            services.AddSingleton<IDestinationService>(new DevelopmentDestinationService());
            if (_inviteEmailSender is not null)
            {
                services.RemoveAll<IInviteEmailSender>();
                services.AddSingleton(_inviteEmailSender);
            }
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
