using System.Text.Json;
using Postern.Application.Integrations;

namespace Postern.Application.Accounts;

public sealed class SuspendedUserService(IAccountRepository accounts, IKvWriter kvWriter)
{
    public const string KvKey = "suspended_users";

    private static readonly SemaphoreSlim WriterLock = new(1, 1);

    public async Task RebuildAsync(CancellationToken cancellationToken)
    {
        await WriterLock.WaitAsync(cancellationToken);
        try
        {
            var suspendedIds = await accounts.ListSuspendedUserIdsAsync(cancellationToken);
            var users = suspendedIds.ToDictionary(id => id.ToString(), _ => true);

            await kvWriter.PutAsync(
                KvKey,
                JsonSerializer.Serialize(new { users }),
                cancellationToken);
        }
        finally
        {
            WriterLock.Release();
        }
    }
}
