namespace Postern.Application.Accounts;

public interface IInviteCodeProtector
{
    string Protect(string inviteCode);
    string Unprotect(string protectedInviteCode);
}
