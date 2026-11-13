using Microsoft.AspNetCore.Identity;
using Postern.Application.Accounts;

namespace Postern.Api.Security;

public sealed class AspNetPasswordHashingService : IPasswordHashingService
{
    private const string HashingContext = "Postern";
    private readonly PasswordHasher<string> _hasher = new();

    public string HashPassword(string password) =>
        _hasher.HashPassword(HashingContext, password);

    public bool VerifyPassword(string passwordHash, string password) =>
        _hasher.VerifyHashedPassword(HashingContext, passwordHash, password)
        != PasswordVerificationResult.Failed;
}
