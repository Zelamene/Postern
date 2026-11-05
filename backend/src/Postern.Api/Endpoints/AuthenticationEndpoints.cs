using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Postern.Api.Security;
using Postern.Application.Accounts;
using Postern.Domain.Accounts;
using Postern.Infrastructure.Integrations;

namespace Postern.Api.Endpoints;

public static class AuthenticationEndpoints
{
    public static IEndpointRouteBuilder MapAuthenticationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/auth");

        group.MapPost("/register", RegisterAsync)
            .RequireRateLimiting("registration");
        group.MapPost("/invite-details", GetInviteDetailsAsync)
            .RequireRateLimiting("registration")
            .WithSummary("Resolve the recipient for a valid invitation")
            .Produces<InviteDetailsResponse>()
            .Produces(StatusCodes.Status404NotFound);
        group.MapPost("/login", LoginAsync)
            .RequireRateLimiting("login");
        group.MapPost("/admin-mfa/setup", GetAdminMfaSetupAsync)
            .RequireRateLimiting("admin-mfa");
        group.MapPost("/admin-mfa/enable", EnableAdminMfaAsync)
            .RequireRateLimiting("admin-mfa");
        group.MapPost("/admin-mfa/verify", VerifyAdminMfaAsync)
            .RequireRateLimiting("admin-mfa");
        group.MapPost("/recovery", ResetPasswordAsync)
            .RequireRateLimiting("recovery");
        group.MapPost("/logout", Logout)
            .RequireAuthorization();
        group.MapGet("/me", GetCurrentAccountAsync)
            .RequireAuthorization();

        return endpoints;
    }

    private static async Task<IResult> GetInviteDetailsAsync(
        InviteDetailsRequest request,
        InviteManagementService invites,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        context.Response.Headers.CacheControl = "no-store";
        var recipient = await invites.FindValidRecipientAsync(request.InviteCode, cancellationToken);
        return recipient is null
            ? Results.NotFound(new { error = "invalid_invite" })
            : Results.Ok(new InviteDetailsResponse(recipient));
    }

    public static IEndpointRouteBuilder MapDevelopmentDestinationEndpoints(
        this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost(
            "/api/dev/destinations/{email}/verify",
            (string email, DevelopmentDestinationService destinations) =>
                destinations.MarkVerified(email) ? Results.NoContent() : Results.NotFound());
        endpoints.MapPost("/api/dev/invites", CreateDevelopmentInviteAsync);
        endpoints.MapGet("/api/dev/invites", ListDevelopmentInvitesAsync);
        return endpoints;
    }

    private static async Task<IResult> ListDevelopmentInvitesAsync(
        InviteManagementService invites,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        context.Response.Headers.CacheControl = "no-store";
        var pendingInvites = await invites.ListPendingDevelopmentInvitesAsync(cancellationToken);
        return Results.Ok(new
        {
            invites = pendingInvites.Select(invite => new
            {
                invite.Id,
                invite.Email,
                invite.Code,
                RegistrationPath = $"/invite/{Uri.EscapeDataString(invite.Code)}",
                invite.ExpiresAt
            })
        });
    }

    private static async Task<IResult> CreateDevelopmentInviteAsync(
        DevelopmentInviteRequest request,
        IAccountRepository accounts,
        TimeProvider timeProvider,
        CancellationToken cancellationToken)
    {
        if (!EmailAddressNormalizer.TryNormalize(request.Email, out var email))
        {
            return Results.ValidationProblem(new Dictionary<string, string[]>
            {
                ["email"] = ["Enter a valid email address."]
            });
        }

        var code = $"postern_invite_{GenerateUrlSafeToken()}";
        await accounts.AddInviteAsync(
            new InviteCode
            {
                Id = Guid.NewGuid(),
                Email = email,
                EmailNormalized = EmailAddressNormalizer.NormalizeIdentity(email),
                CodeHash = AuthenticationService.HashInviteCode(code),
                CreatedAt = timeProvider.GetUtcNow(),
                ExpiresAt = timeProvider.GetUtcNow().AddDays(7)
            },
            cancellationToken);

        return Results.Created(
            "/api/dev/invites",
            new DevelopmentInviteResponse(
                code,
                email,
                $"/invite/{Uri.EscapeDataString(code)}"));
    }

    private static string GenerateUrlSafeToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(18))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

    private static async Task<IResult> RegisterAsync(
        RegisterRequest request,
        AuthenticationService authentication,
        InviteManagementService invites,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        context.Response.Headers.CacheControl = "no-store";
        var email = request.Email;
        if (string.IsNullOrWhiteSpace(email))
        {
            email = await invites.FindValidRecipientAsync(request.InviteCode, cancellationToken);
            if (email is null)
            {
                return Results.BadRequest(new { error = "invalid_invite" });
            }
        }

        var result = await authentication.RegisterAsync(
            email,
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
        IAccountRepository accounts,
        AdminMfaService adminMfa,
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

        if (account.IsAdmin)
        {
            var adminUser = await accounts.FindByIdAsync(account.UserId, cancellationToken);
            if (adminUser is not { IsAdmin: true, Status: "active" })
            {
                return Results.Unauthorized();
            }

            var purpose = adminUser.AdminTotpEnabledAt is null ? "setup" : "login";
            var challenge = await adminMfa.CreateChallengeAsync(
                account.UserId,
                purpose,
                cancellationToken);
            if (challenge is null)
            {
                return Results.Unauthorized();
            }

            DeleteAuthenticationCookie(context);
            SetAdminMfaChallengeCookie(context, challenge);
            return Results.Ok(new LoginResponse(
                null,
                null,
                account.RecoveryKey,
                MfaRequired: purpose == "login",
                MfaSetupRequired: purpose == "setup"));
        }

        SetAuthenticationCookie(context, tokenIssuer, account);
        return Results.Ok(new LoginResponse(
            account.UserId,
            account.Email,
            account.RecoveryKey));
    }

    private static async Task<IResult> GetAdminMfaSetupAsync(
        AdminMfaService adminMfa,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        context.Response.Headers.CacheControl = "no-store";
        var setup = await adminMfa.GetSetupAsync(
            context.Request.Cookies[AdminMfaCookieName],
            cancellationToken);
        return setup is null
            ? Results.Unauthorized()
            : Results.Ok(setup);
    }

    private static async Task<IResult> EnableAdminMfaAsync(
        AdminMfaCodeRequest request,
        AdminMfaService adminMfa,
        JwtTokenIssuer tokenIssuer,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        context.Response.Headers.CacheControl = "no-store";
        var admin = await adminMfa.CompleteEnrollmentAsync(
            context.Request.Cookies[AdminMfaCookieName],
            request.Code,
            cancellationToken);
        if (admin is null)
        {
            return Results.Unauthorized();
        }

        DeleteAdminMfaChallengeCookie(context);
        SetAuthenticationCookie(
            context,
            tokenIssuer,
            new AuthenticatedAccount(admin.Id, admin.Email, true, null));
        return Results.NoContent();
    }

    private static async Task<IResult> VerifyAdminMfaAsync(
        AdminMfaCodeRequest request,
        AdminMfaService adminMfa,
        JwtTokenIssuer tokenIssuer,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        context.Response.Headers.CacheControl = "no-store";
        var admin = await adminMfa.CompleteLoginAsync(
            context.Request.Cookies[AdminMfaCookieName],
            request.Code,
            cancellationToken);
        if (admin is null)
        {
            return Results.Unauthorized();
        }

        DeleteAdminMfaChallengeCookie(context);
        SetAuthenticationCookie(
            context,
            tokenIssuer,
            new AuthenticatedAccount(admin.Id, admin.Email, true, null));
        return Results.NoContent();
    }

    private const string AdminMfaCookieName = "Postern.AdminMfa";

    private static void SetAdminMfaChallengeCookie(HttpContext context, string token) =>
        context.Response.Cookies.Append(
            AdminMfaCookieName,
            token,
            new CookieOptions
            {
                HttpOnly = true,
                Secure = !context.RequestServices.GetRequiredService<IWebHostEnvironment>().IsDevelopment(),
                SameSite = SameSiteMode.Strict,
                Path = "/api/auth/admin-mfa",
                MaxAge = AdminMfaService.ChallengeLifetime
            });

    private static void DeleteAdminMfaChallengeCookie(HttpContext context) =>
        context.Response.Cookies.Delete(
            AdminMfaCookieName,
            new CookieOptions
            {
                HttpOnly = true,
                Secure = !context.RequestServices.GetRequiredService<IWebHostEnvironment>().IsDevelopment(),
                SameSite = SameSiteMode.Strict,
                Path = "/api/auth/admin-mfa"
            });

    private static void SetAuthenticationCookie(
        HttpContext context,
        JwtTokenIssuer tokenIssuer,
        AuthenticatedAccount account) =>
        context.Response.Cookies.Append(
            JwtTokenIssuer.CookieName,
            tokenIssuer.Issue(account),
            new CookieOptions
            {
                HttpOnly = true,
                Secure = !context.RequestServices.GetRequiredService<IWebHostEnvironment>().IsDevelopment(),
                SameSite = SameSiteMode.Strict,
                Path = "/",
                MaxAge = JwtTokenIssuer.LifetimeFor(account)
            });

    private static IResult Logout(HttpContext context)
    {
        context.Response.Headers.CacheControl = "no-store";
        DeleteAuthenticationCookie(context);
        DeleteAdminMfaChallengeCookie(context);
        return Results.NoContent();
    }

    private static void DeleteAuthenticationCookie(HttpContext context) =>
        context.Response.Cookies.Delete(
            JwtTokenIssuer.CookieName,
            new CookieOptions
            {
                HttpOnly = true,
                Secure = !context.RequestServices.GetRequiredService<IWebHostEnvironment>().IsDevelopment(),
                SameSite = SameSiteMode.Strict,
                Path = "/"
            });

    private static async Task<IResult> GetCurrentAccountAsync(
        ClaimsPrincipal user,
        IAccountRepository accounts,
        HttpContext context,
        CancellationToken cancellationToken)
    {
        context.Response.Headers.CacheControl = "no-store";
        var userId = user.FindFirstValue(ClaimTypes.NameIdentifier);
        var email = user.FindFirstValue(ClaimTypes.Email);
        if (!Guid.TryParse(userId, out var parsedUserId) || string.IsNullOrEmpty(email))
        {
            return Results.Unauthorized();
        }

        var account = await accounts.FindByIdAsync(parsedUserId, cancellationToken);

        return Results.Ok(new CurrentAccountResponse(
            parsedUserId,
            email,
            account?.EffectiveForwardingAddress ?? email));
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

    /// <summary>Request payload for resolving the recipient tied to an invitation.</summary>
    public sealed record InviteDetailsRequest(string? InviteCode);

    /// <summary>Recipient email associated with a valid invitation.</summary>
    public sealed record InviteDetailsResponse(string Email);

    public sealed record RegisterRequest(string? Email, string? Password, string? InviteCode);
    public sealed record LoginRequest(string? Email, string? Password);
    public sealed record AdminMfaCodeRequest(string? Code);
    public sealed record RecoveryRequest(string? RecoveryKey, string? NewPassword);
    public sealed record LoginResponse(
        Guid? UserId,
        string? Email,
        string? RecoveryKey,
        bool MfaRequired = false,
        bool MfaSetupRequired = false);
    public sealed record CurrentAccountResponse(Guid UserId, string Email, string? ForwardingAddress);
    public sealed record DevelopmentInviteRequest(string? Email);
    public sealed record DevelopmentInviteResponse(string Code, string Email, string RegistrationPath);
    public sealed record RecoveryResponse(string RecoveryKey);
}
