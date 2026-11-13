using System.Text;
using System.Threading.RateLimiting;
using System.Security.Claims;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Postern.Api.Endpoints;
using Postern.Api.Notifications;
using Postern.Api.Realtime;
using Postern.Api.Security;
using Postern.Api.Workers;
using Postern.Application.Accounts;
using Postern.Application.Activity;
using Postern.Application.Administration;
using Postern.Application.Aliases;
using Postern.Application.Integrations;
using Postern.Application.Notifications;
using Postern.Infrastructure.Accounts;
using Postern.Infrastructure.Activity;
using Postern.Infrastructure.Administration;
using Postern.Infrastructure.Aliases;
using Postern.Infrastructure.Integrations;
using Postern.Infrastructure.Notifications;
using Postern.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);

var signingKey = builder.Configuration["Authentication:SigningKey"];
if (string.IsNullOrWhiteSpace(signingKey)
    || signingKey.StartsWith("replace-with-", StringComparison.OrdinalIgnoreCase)
    || Encoding.UTF8.GetByteCount(signingKey) < 32)
{
    throw new InvalidOperationException(
        "Authentication:SigningKey must be configured with at least 32 bytes of random material.");
}

var jwtOptions = new JwtOptions(
    builder.Configuration["Authentication:Issuer"] ?? "Postern",
    builder.Configuration["Authentication:Audience"] ?? "Postern.Web",
    signingKey);

var connectionString = builder.Configuration.GetConnectionString("Postgres");
if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException("The PostgreSQL connection string is required.");
}

if (!builder.Environment.IsDevelopment()
    && string.IsNullOrWhiteSpace(builder.Configuration["Ingest:SharedSecret"]))
{
    throw new InvalidOperationException(
        "Ingest:SharedSecret must be configured outside Development so the worker endpoint is authenticated.");
}

if (!builder.Environment.IsDevelopment()
    && string.IsNullOrWhiteSpace(builder.Configuration["Jobs:SharedSecret"]))
{
    throw new InvalidOperationException(
        "Jobs:SharedSecret must be configured outside Development so the nightly job endpoint is authenticated.");
}

var resendApiKey = builder.Configuration["Resend:ApiKey"] ?? builder.Configuration["RESEND_API_KEY"];
var resendWebhookSecret =
    builder.Configuration["Resend:WebhookSecret"] ?? builder.Configuration["RESEND_WEBHOOK_SECRET"];
var resendFrom = builder.Configuration["Resend:From"];
var publicInviteBaseUrl = builder.Configuration["Invites:PublicBaseUrl"];
var inviteWorkerEnabled = !builder.Environment.IsDevelopment()
    && (builder.Configuration.GetValue<bool?>("Invites:WorkerEnabled")
        ?? !string.IsNullOrWhiteSpace(resendApiKey));
if (!builder.Environment.IsDevelopment()
    && (string.IsNullOrWhiteSpace(resendApiKey)
        || string.IsNullOrWhiteSpace(resendWebhookSecret)
        || string.IsNullOrWhiteSpace(resendFrom)
        || string.IsNullOrWhiteSpace(publicInviteBaseUrl)))
{
    throw new InvalidOperationException(
        "Production invite delivery requires Resend credentials, Resend:From, and Invites:PublicBaseUrl.");
}

if (inviteWorkerEnabled
    && (string.IsNullOrWhiteSpace(resendApiKey)
        || string.IsNullOrWhiteSpace(resendFrom)
        || string.IsNullOrWhiteSpace(publicInviteBaseUrl)))
{
    throw new InvalidOperationException(
        "Invite delivery requires Resend:ApiKey, Resend:From, and Invites:PublicBaseUrl.");
}

if (!string.IsNullOrWhiteSpace(publicInviteBaseUrl)
    && (!Uri.TryCreate(publicInviteBaseUrl, UriKind.Absolute, out var inviteBaseUri)
        || (!builder.Environment.IsDevelopment() && inviteBaseUri.Scheme != Uri.UriSchemeHttps)))
{
    throw new InvalidOperationException(
        "Invites:PublicBaseUrl must be an absolute URL and use HTTPS outside Development.");
}

var aliasDomain = builder.Configuration["Alias:Domain"];
if (string.IsNullOrWhiteSpace(aliasDomain))
{
    aliasDomain = AliasPolicy.DefaultDomain;
}

var suffixLength = AliasPolicy.DefaultSuffixLength;
if (int.TryParse(builder.Configuration["Alias:SuffixLength"], out var configuredSuffixLength))
{
    suffixLength = configuredSuffixLength;
}

if (suffixLength is < AliasPolicy.MinimumSuffixLength or > AliasPolicy.MaximumSuffixLength)
{
    throw new InvalidOperationException(
        $"Alias:SuffixLength must be between {AliasPolicy.MinimumSuffixLength} and {AliasPolicy.MaximumSuffixLength}.");
}

var aliasPolicy = new AliasPolicy(aliasDomain, suffixLength);

builder.Services.AddDbContext<PosternDbContext>(options =>
    PosternDbContext.ConfigureNpgsql(options, connectionString));
builder.Services.AddScoped<IAccountRepository>(services =>
    new EfAccountRepository(
        services.GetRequiredService<PosternDbContext>(),
        builder.Environment.IsDevelopment()));
builder.Services.AddScoped<IInviteRepository, EfInviteRepository>();
builder.Services.AddScoped<InviteManagementService>();
builder.Services.AddSingleton<IInviteCodeProtector, DataProtectionInviteCodeProtector>();
builder.Services.AddSingleton<ResendWebhookSignatureVerifier>();
var dataProtection = builder.Services
    .AddDataProtection()
    .SetApplicationName("Postern");
if (builder.Environment.IsDevelopment())
{
    dataProtection.PersistKeysToFileSystem(
        new DirectoryInfo(Path.Combine(Path.GetTempPath(), "postern-dataprotection")));
}
else
{
    dataProtection.PersistKeysToDbContext<PosternDbContext>();
}
builder.Services.AddHttpClient("resend-email", client =>
{
    client.BaseAddress = new Uri("https://api.resend.com/");
    client.Timeout = TimeSpan.FromSeconds(30);
});
if (inviteWorkerEnabled)
{
    builder.Services.AddTransient<IInviteEmailSender>(services =>
        new ResendEmailSender(
            services.GetRequiredService<IHttpClientFactory>().CreateClient("resend-email"),
            resendApiKey ?? string.Empty,
            resendFrom ?? throw new InvalidOperationException("Resend:From is not configured.")));
    builder.Services.AddHostedService<InviteEmailOutboxWorker>();
}
builder.Services.AddScoped<IAliasRepository, EfAliasRepository>();
builder.Services.AddScoped<IActivityRepository, EfActivityRepository>();
builder.Services.AddScoped<AuthenticationService>();
builder.Services.AddScoped<AdminMfaService>();
builder.Services.AddSignalR();
builder.Services.AddSingleton<IAdminRealtimeNotifier, AdminRealtimeNotifier>();
builder.Services.AddSingleton<IUserRealtimeNotifier, UserRealtimeNotifier>();
builder.Services.AddSingleton<INotificationPublisher, NotificationPublisher>();
builder.Services.AddScoped<INotificationRepository, EfNotificationRepository>();
builder.Services.AddScoped<NotificationService>();
builder.Services.AddScoped<AccountManagementService>();
builder.Services.AddScoped<AliasService>();
builder.Services.AddScoped<IngestService>();
builder.Services.AddScoped<ActivityService>();
builder.Services.AddScoped<RateLimitService>();
builder.Services.AddScoped<SuspendedUserService>();
builder.Services.AddScoped<GlobalBlocklistService>();
builder.Services.AddScoped<AdministrationService>();
builder.Services.AddScoped<AdminAnalyticsService>();
builder.Services.AddScoped<AdminKvSyncService>();
builder.Services.AddScoped<NightlyMaintenanceService>();
builder.Services.AddScoped<IAdministrationRepository, EfAdministrationRepository>();
builder.Services.AddSingleton(aliasPolicy);
builder.Services.AddSingleton<IPasswordHashingService, AspNetPasswordHashingService>();
builder.Services.AddSingleton(TimeProvider.System);
var cloudflareOptions = builder.Configuration
    .GetSection(CloudflareOptions.SectionName)
    .Get<CloudflareOptions>() ?? new CloudflareOptions();

if (!builder.Environment.IsDevelopment())
{
    cloudflareOptions.Validate();
}

builder.Services.AddSingleton(cloudflareOptions);
builder.Services.AddHttpClient("cloudflare", client =>
{
    client.BaseAddress = new Uri("https://api.cloudflare.com/client/v4/");
    client.Timeout = TimeSpan.FromSeconds(30);
    client.DefaultRequestHeaders.Authorization =
        new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", cloudflareOptions.ApiToken);
});

if (cloudflareOptions.IsConfigured)
{
    builder.Services.AddSingleton<IKvWriter>(services =>
        new CloudflareKvWriter(
            services.GetRequiredService<IHttpClientFactory>().CreateClient("cloudflare"),
            cloudflareOptions,
            services.GetRequiredService<ILogger<CloudflareKvWriter>>()));

    builder.Services.AddSingleton<IDestinationService>(services =>
        new CloudflareDestinationService(
            services.GetRequiredService<IHttpClientFactory>().CreateClient("cloudflare"),
            cloudflareOptions,
            services.GetRequiredService<ILogger<CloudflareDestinationService>>()));
}
else if (builder.Environment.IsDevelopment())
{
    builder.Services.AddSingleton<IKvWriter, NoOpKvWriter>();
    builder.Services.AddSingleton<DevelopmentDestinationService>();
    builder.Services.AddSingleton<IDestinationService>(
        services => services.GetRequiredService<DevelopmentDestinationService>());
}
else
{
    throw new InvalidOperationException(
        "Cloudflare integration configuration is required outside Development.");
}

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
    options.ForwardLimit = 1;
});

var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? [];

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        if (allowedOrigins.Length > 0)
        {
            policy
                .WithOrigins(allowedOrigins)
                .AllowAnyHeader()
                .AllowAnyMethod()
                .AllowCredentials();
        }
    });
});

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = true;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtOptions.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = jwtOptions.CreateSigningKey(),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            ValidAlgorithms = [SecurityAlgorithms.HmacSha256]
        };
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                context.Token = context.Request.Cookies[JwtTokenIssuer.CookieName];
                return Task.CompletedTask;
            }
        };
    });
builder.Services.AddAuthorization(options =>
    options.AddPolicy("admin", policy =>
    {
        policy.RequireRole("admin").RequireClaim(ClaimTypes.AuthenticationMethod, "totp");
        policy.AddRequirements(new AdminTotpSessionRequirement());
    }));
builder.Services.AddScoped<IAuthorizationHandler, AdminTotpSessionHandler>();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("registration", context => CreateRateLimit(context, 5, TimeSpan.FromHours(1)));
    options.AddPolicy("login", context => CreateRateLimit(context, 10, TimeSpan.FromMinutes(15)));
    options.AddPolicy("admin-mfa", context => CreateRateLimit(context, 5, TimeSpan.FromMinutes(15)));
    options.AddPolicy("recovery", context => CreateRateLimit(context, 5, TimeSpan.FromMinutes(15)));
    options.AddPolicy("invite-request", context => CreateRateLimit(context, 5, TimeSpan.FromHours(1)));
});
builder.Services.AddSingleton(jwtOptions);
builder.Services.AddSingleton<JwtTokenIssuer>();

if (builder.Environment.IsDevelopment())
{
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen();
}

var app = builder.Build();

app.UseForwardedHeaders();
app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.MapDevelopmentDestinationEndpoints();
}

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapHub<AdminEventsHub>("/api/admin/events").RequireAuthorization("admin");
app.MapHub<UserEventsHub>("/api/user/events").RequireAuthorization();
app.MapAuthenticationEndpoints();
app.MapAccountManagementEndpoints();
app.MapNotificationEndpoints();
app.MapInviteEndpoints();
app.MapAliasEndpoints();
app.MapActivityEndpoints();
app.MapIngestEndpoints();
app.MapAdministrationEndpoints();
app.MapJobEndpoints();

await app.RunAsync();

static RateLimitPartition<string> CreateRateLimit(
    HttpContext context,
    int permitLimit,
    TimeSpan window) =>
    RateLimitPartition.GetFixedWindowLimiter(
        context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = permitLimit,
            Window = window,
            QueueLimit = 0,
            AutoReplenishment = true
        });

public partial class Program { }
