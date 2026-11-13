using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;
using Postern.Application.Accounts;

namespace Postern.Api.Security;

public sealed class JwtTokenIssuer(JwtOptions options, TimeProvider timeProvider)
{
    public const string CookieName = "Postern.Auth";
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(1);
    public static readonly TimeSpan AdminLifetime = TimeSpan.FromMinutes(15);

    public static TimeSpan LifetimeFor(AuthenticatedAccount account) =>
        account.IsAdmin ? AdminLifetime : Lifetime;

    public string Issue(AuthenticatedAccount account)
    {
        var now = timeProvider.GetUtcNow();
        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, account.UserId.ToString()),
            new(JwtRegisteredClaimNames.Email, account.Email),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };
        if (account.IsAdmin)
        {
            claims.Add(new Claim(ClaimTypes.Role, "admin"));
            claims.Add(new Claim(ClaimTypes.AuthenticationMethod, "totp"));
            claims.Add(new Claim("amr_time", now.ToUnixTimeMilliseconds().ToString(
                System.Globalization.CultureInfo.InvariantCulture)));
        }

        var lifetime = LifetimeFor(account);
        var token = new JwtSecurityToken(
            options.Issuer,
            options.Audience,
            claims,
            now.UtcDateTime,
            now.Add(lifetime).UtcDateTime,
            new SigningCredentials(options.CreateSigningKey(), SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
