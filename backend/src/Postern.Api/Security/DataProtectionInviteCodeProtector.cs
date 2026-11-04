using Microsoft.AspNetCore.DataProtection;
using Postern.Application.Accounts;

namespace Postern.Api.Security;

public sealed class DataProtectionInviteCodeProtector(IDataProtectionProvider provider)
    : IInviteCodeProtector
{
    private readonly IDataProtector _protector = provider.CreateProtector("Postern.InviteOutbox.v1");

    public string Protect(string inviteCode) => _protector.Protect(inviteCode);

    public string Unprotect(string protectedInviteCode) => _protector.Unprotect(protectedInviteCode);
}
