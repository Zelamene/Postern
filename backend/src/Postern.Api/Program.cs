using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Postern.Api.Endpoints;
using Postern.Api.Security;
using Postern.Application.Accounts;
using Postern.Application.Activity;
using Postern.Application.Administration;
using Postern.Application.Aliases;
using Postern.Application.Integrations;
using Postern.Infrastructure.Accounts;
using Postern.Infrastructure.Activity;
using Postern.Infrastructure.Administration;
using Postern.Infrastructure.Aliases;
using Postern.Infrastructure.Integrations;
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

var issuer = builder.Configuration["Authentication:Issuer"] ?? "Postern";
var audience = builder.Configuration["Authentication:Audience"] ?? "Postern.Web";
var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey));

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
builder.Services.AddScoped<IAccountRepository, EfAccountRepository>();
builder.Services.AddScoped<IAliasRepository, EfAliasRepository>();
builder.Services.AddScoped<IActivityRepository, EfActivityRepository>();
builder.Services.AddScoped<AuthenticationService>();
builder.Services.AddScoped<AccountManagementService>();
builder.Services.AddScoped<AliasService>();
builder.Services.AddScoped<IngestService>();
builder.Services.AddScoped<ActivityService>();
builder.Services.AddScoped<RateLimitService>();
builder.Services.AddScoped<SuspendedUserService>();
builder.Services.AddScoped<GlobalBlocklistService>();
builder.Services.AddScoped<AdministrationService>();
builder.Services.AddScoped<IAdministrationRepository, EfAdministrationRepository>();
builder.Services.AddSingleton(aliasPolicy);
builder.Services.AddSingleton<IPasswordHashingService, AspNetPasswordHashingService>();
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<IKvWriter, NoOpKvWriter>();

if (builder.Environment.IsDevelopment())
{
    builder.Services.AddSingleton<DevelopmentDestinationService>();
    builder.Services.AddSingleton<IDestinationService>(
        services => services.GetRequiredService<DevelopmentDestinationService>());
}
else
{
    builder.Services.AddSingleton<IDestinationService, UnconfiguredDestinationService>();
}

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = true;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = issuer,
            ValidateAudience = true,
            ValidAudience = audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = key,
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
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("registration", context => CreateRateLimit(context, 5, TimeSpan.FromHours(1)));
    options.AddPolicy("login", context => CreateRateLimit(context, 10, TimeSpan.FromMinutes(15)));
    options.AddPolicy("recovery", context => CreateRateLimit(context, 5, TimeSpan.FromMinutes(15)));
});
builder.Services.AddSingleton<JwtTokenIssuer>();

if (builder.Environment.IsDevelopment())
{
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen();
}

var app = builder.Build();

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
app.MapAuthenticationEndpoints();
app.MapAccountManagementEndpoints();
app.MapAliasEndpoints();
app.MapActivityEndpoints();
app.MapIngestEndpoints();
app.MapAdministrationEndpoints();

app.Run();

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
