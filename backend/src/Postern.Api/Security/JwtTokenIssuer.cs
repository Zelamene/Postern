using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using Postern.Application.Accounts;

namespace Postern.Api.Security;

public sealed class JwtTokenIssuer(IConfiguration configuration, TimeProvider timeProvider)
{
    public const string CookieName = "Postern.Auth";
    public static readonly TimeSpan Lifetime = TimeSpan.FromHours(1);

    public string Issue(AuthenticatedAccount account)
    {
        var signingKey = configuration["Authentication:SigningKey"]
            ?? throw new InvalidOperationException("The JWT signing key is not configured.");
        var issuer = configuration["Authentication:Issuer"] ?? "Postern";
        var audience = configuration["Authentication:Audience"] ?? "Postern.Web";
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
        }

        var token = new JwtSecurityToken(
            issuer,
            audience,
            claims,
            now.UtcDateTime,
            now.Add(Lifetime).UtcDateTime,
            new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)),
                SecurityAlgorithms.HmacSha256));

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
