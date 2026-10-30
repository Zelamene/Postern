using System.Text.Json;
using Postern.Application.Administration;
using Postern.Domain.Administration;
using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public class GlobalBlocklistServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 30, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Rebuild_PublishesEveryDomainInOrdinalOrder()
    {
        var administration = new InMemoryAdministrationRepository();
        administration.Seed(ADomain("zeta.ru"));
        administration.Seed(ADomain("alpha.ru"));
        administration.Seed(ADomain("mike.ru"));
        var kvWriter = new InMemoryKvWriter();
        var service = new GlobalBlocklistService(administration, kvWriter);

        await service.RebuildAsync(CancellationToken.None);

        Assert.Equal(["alpha.ru", "mike.ru", "zeta.ru"], ReadDomains(kvWriter));
    }

    [Fact]
    public async Task Rebuild_OverwritesThePreviousMap()
    {
        var kvWriter = new InMemoryKvWriter();
        await kvWriter.PutAsync(GlobalBlocklistService.KvKey, "{\"domains\":[\"stale.ru\"]}", CancellationToken.None);
        var service = new GlobalBlocklistService(new InMemoryAdministrationRepository(), kvWriter);

        await service.RebuildAsync(CancellationToken.None);

        Assert.Empty(ReadDomains(kvWriter));
    }

    private static List<string> ReadDomains(InMemoryKvWriter kvWriter)
    {
        var json = kvWriter.Values[GlobalBlocklistService.KvKey];
        return JsonDocument.Parse(json)
            .RootElement
            .GetProperty("domains")
            .EnumerateArray()
            .Select(item => item.GetString()!)
            .ToList();
    }

    private static GlobalBlockedDomain ADomain(string domain) => new()
    {
        DomainEtld1 = domain,
        Reason = "test",
        CreatedAt = Now
    };
}
