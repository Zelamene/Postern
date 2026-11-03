namespace Postern.Application.Accounts;

public interface IPasswordHashingService
{
    string HashPassword(string password);
    bool VerifyPassword(string passwordHash, string password);
}
