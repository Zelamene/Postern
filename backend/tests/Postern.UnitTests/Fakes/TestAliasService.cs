using Postern.Application.Accounts;
using Postern.Application.Aliases;
using Postern.Application.Integrations;

namespace Postern.UnitTests.Fakes;

public static class TestAliasService
{
    public static AliasService Create(
        IAliasRepository aliases,
        TimeProvider timeProvider,
        IKvWriter kvWriter,
        IAccountRepository? accounts = null,
        AliasPolicy? policy = null) =>
        new(
            aliases,
            accounts ?? new InMemoryAccountRepository(),
            timeProvider,
            kvWriter,
            policy ?? AliasPolicy.Default);
}
