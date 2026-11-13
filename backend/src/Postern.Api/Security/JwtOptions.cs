using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace Postern.Api.Security;

public sealed record JwtOptions(string Issuer, string Audience, string SigningKey)
{
    public SymmetricSecurityKey CreateSigningKey() =>
        new(Encoding.UTF8.GetBytes(SigningKey));
}
