namespace Postern.Application.Accounts;

public enum RegistrationResult
{
    Created,
    InvalidRequest,
    InvalidInvite,
    UserLimitReached,
    EmailAlreadyRegistered
}
