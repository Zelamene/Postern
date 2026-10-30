using System.Text.Json;
using Postern.Application.Integrations;

namespace Postern.Application.Administration;

public sealed class GlobalBlocklistService(IAdministrationRepository administration, IKvWriter kvWriter)
{
    public const string KvKey = "__global_blocklist";

    private static readonly SemaphoreSlim WriterLock = new(1, 1);

    public async Task RebuildAsync(CancellationToken cancellationToken)
    {
        await WriterLock.WaitAsync(cancellationToken);
        try
        {
            var stored = await administration.ListBlockedDomainsAsync(cancellationToken);
            var domains = stored
                .Select(domain => domain.DomainEtld1)
                .OrderBy(domain => domain, StringComparer.Ordinal)
                .ToList();

            await kvWriter.PutAsync(
                KvKey,
                JsonSerializer.Serialize(new { domains }),
                cancellationToken);
        }
        finally
        {
            WriterLock.Release();
        }
    }
}
