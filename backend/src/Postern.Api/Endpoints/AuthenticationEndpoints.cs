using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Postern.Api.Security;
using Postern.Application.Accounts;
using Postern.Infrastructure.Integrations;

namespace Postern.Api.Endpoints;

public static class AuthenticationEndpoints
{
    public static IEndpointRouteBuilder MapAuthenticationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/auth");

        group.MapPost("/register", RegisterAsync)
            .RequireRateLimiting("registration");
        group.MapPost("/login", LoginAsync)
            .RequireRateLimiting("login");
        group.MapPost("/recovery", ResetPasswordAsync)
            .RequireRateLimiting("recovery");
        group.MapPost("/logout", Logout)
            .RequireAuthorization();
        group.MapGet("/me", GetCurrentAccount)
            .RequireAuthorization();

        return endpoints;
    }

    public static IEndpointRouteBuilder MapDevelopmentDestinationEndpoints(
        this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost(
            "/api/dev/destinations/{email}/verify",
            (string email, DevelopmentDestinationService destinations) =>
                destinations.MarkVerified(email) ? Results.NoContent() : Results.NotFound());
        return endpoints;
    }

    private static async Task<IResult> RegisterAsync(
        RegisterRequest request,
        AuthenticationService authentication,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        context.Response.Headers.CacheControl = "no-store";
        var result = await authentication.RegisterAsync(
            request.Email,
            request.Password,
            request.InviteCode,
            cancellationToken);

        return result switch
        {
            RegistrationResult.Created => Results.Accepted(
                value: new { status = "pending_verification" }),
            RegistrationResult.InvalidRequest => Results.ValidationProblem(
                new Dictionary<string, string[]>
                {
                    ["request"] =
                    [
                        $"Email must be valid; password must be {AuthenticationService.MinimumPasswordLength}-{AuthenticationService.MaximumPasswordLength} characters."
                    ]
                }),
            RegistrationResult.InvalidInvite => Results.BadRequest(
                new { error = "invalid_invite" }),
            RegistrationResult.UserLimitReached => Results.Conflict(
                new { error = "user_limit_reached" }),
            RegistrationResult.EmailAlreadyRegistered => Results.Conflict(
                new { error = "registration_unavailable" }),
            _ => throw new InvalidOperationException("Unknown account registration result.")
        };
    }

    private static async Task<IResult> LoginAsync(
        LoginRequest request,
        AuthenticationService authentication,
        JwtTokenIssuer tokenIssuer,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        context.Response.Headers.CacheControl = "no-store";
        var (result, account) = await authentication.LoginAsync(
            request.Email,
            request.Password,
            cancellationToken);

        if (result == AuthenticationResult.InvalidCredentials)
        {
            return Results.Unauthorized();
        }

        if (result == AuthenticationResult.VerificationRequired)
        {
            return Results.Json(
                new { error = "verification_required" },
                statusCode: StatusCodes.Status403Forbidden);
        }

        if (account is null)
        {
            throw new InvalidOperationException("An authenticated result must contain an account.");
        }

        context.Response.Cookies.Append(
            JwtTokenIssuer.CookieName,
            tokenIssuer.Issue(account),
            new CookieOptions
            {
                HttpOnly = true,
                Secure = !context.RequestServices.GetRequiredService<IWebHostEnvironment>().IsDevelopment(),
                SameSite = SameSiteMode.Strict,
                Path = "/",
                MaxAge = JwtTokenIssuer.Lifetime
            });

        return Results.Ok(new LoginResponse(
            account.UserId,
            account.Email,
            account.RecoveryKey));
    }

    private static IResult Logout(HttpContext context)
    {
        context.Response.Headers.CacheControl = "no-store";
        context.Response.Cookies.Delete(
            JwtTokenIssuer.CookieName,
            new CookieOptions
            {
                HttpOnly = true,
                Secure = !context.RequestServices.GetRequiredService<IWebHostEnvironment>().IsDevelopment(),
                SameSite = SameSiteMode.Strict,
                Path = "/"
            });
        return Results.NoContent();
    }

    private static IResult GetCurrentAccount(ClaimsPrincipal user)
    {
        var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
        var email = user.FindFirstValue(ClaimTypes.Email);
        if (!Guid.TryParse(userId, out var parsedUserId) || string.IsNullOrEmpty(email))
        {
            return Results.Unauthorized();
        }

        return Results.Ok(new CurrentAccountResponse(parsedUserId, email));
    }

    private static async Task<IResult> ResetPasswordAsync(
        RecoveryRequest request,
        AuthenticationService authentication,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        context.Response.Headers.CacheControl = "no-store";
        var nextRecoveryKey = await authentication.ResetPasswordAsync(
            request.RecoveryKey,
            request.NewPassword,
            cancellationToken);
        return nextRecoveryKey is null
            ? Results.Unauthorized()
            : Results.Ok(new RecoveryResponse(nextRecoveryKey));
    }

    public sealed record RegisterRequest(string? Email, string? Password, string? InviteCode);
    public sealed record LoginRequest(string? Email, string? Password);
    public sealed record RecoveryRequest(string? RecoveryKey, string? NewPassword);
    public sealed record LoginResponse(Guid UserId, string Email, string? RecoveryKey);
    public sealed record CurrentAccountResponse(Guid UserId, string Email);
    public sealed record RecoveryResponse(string RecoveryKey);
}
