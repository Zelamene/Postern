using Postern.Application.Accounts;

namespace Postern.UnitTests.Fakes;

public sealed class FakeInviteCodeProtector : IInviteCodeProtector
{
    public string Protect(string inviteCode) => $"protected:{inviteCode}";
    public string Unprotect(string protectedInviteCode) => protectedInviteCode["protected:".Length..];
}
