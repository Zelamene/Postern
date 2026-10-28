namespace Postern.Application.Accounts;

public sealed record AuthenticatedAccount(
    Guid UserId,
    string Email,
    bool IsAdmin,
    string? RecoveryKey);
