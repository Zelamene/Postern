using Postern.Application.Accounts;
using Postern.Application.Activity;
using Postern.Application.Administration;
using Postern.Application.Aliases;
using Postern.Domain.Aliases;
using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public class KvDirtyCrashWindowTests
{
    [Fact]
    public async Task CreateAsync_AfterTheWriteIsConfirmed_ClearsTheDirtyFlag()
    {
        var repository = new InMemoryAliasRepository();
        var service = TestAliasService.Create(repository, TimeProvider.System, new InMemoryKvWriter());

        var alias = await service.CreateAsync(Guid.NewGuid(), "shop", "", CancellationToken.None);

        Assert.NotNull(alias);
        Assert.False(alias!.KvDirty);
        Assert.DoesNotContain(alias.Id, repository.KvDirtyAliasIds);
    }

    [Fact]
    public async Task CreateAsync_WhenTheWriteNeverLands_LeavesTheAliasDirty()
    {
        var repository = new InMemoryAliasRepository();
        var service = TestAliasService.Create(
            repository,
            TimeProvider.System,
            new InMemoryKvWriter { ShouldFail = true });

        var alias = await service.CreateAsync(Guid.NewGuid(), "shop", "", CancellationToken.None);

        Assert.NotNull(alias);
        Assert.True(alias!.KvDirty);
        Assert.Contains(alias.Id, repository.KvDirtyAliasIds);
    }

    [Fact]
    public async Task DisableAsync_AfterTheWriteIsConfirmed_ClearsTheDirtyFlag()
    {
        var repository = new InMemoryAliasRepository();
        var alias = SeedAlias(repository, Guid.NewGuid());
        await repository.MarkKvDirtyAsync(alias.Id, CancellationToken.None);
        var service = TestAliasService.Create(repository, TimeProvider.System, new InMemoryKvWriter());

        Assert.True(await service.DisableAsync(alias.UserId!.Value, alias.Id, CancellationToken.None));

        Assert.False(alias.KvDirty);
        Assert.DoesNotContain(alias.Id, repository.KvDirtyAliasIds);
    }

    [Fact]
    public async Task DirtyOnlySync_RepairsARowLeftDirtyByACrash()
    {
        var aliases = new InMemoryAliasRepository();
        var userId = Guid.NewGuid();
        var alias = SeedAlias(aliases, userId);
        // Simulates the crash: the status change committed, the projection write never ran.
        await aliases.MarkKvDirtyAsync(alias.Id, CancellationToken.None);

        var administration = new InMemoryAdministrationRepository(aliases);
        administration.Aliases.Add(new AdminKvSyncAlias(
            alias.Id,
            alias.FullAddress!,
            userId,
            "destination@example.test",
            "disabled",
            []));
        var kv = new InMemoryKvWriter();
        var sync = CreateSyncService(administration, aliases, kv);

        var result = await sync.SyncAsync(null, CancellationToken.None, fullSync: false);

        Assert.Equal(1, result.AliasesSynced);
        Assert.False(result.FullSync);
        Assert.True(kv.Values.ContainsKey(alias.FullAddress!.ToLowerInvariant()));
        Assert.DoesNotContain(alias.Id, aliases.KvDirtyAliasIds);
        Assert.Equal(0, result.RemainingDirtyAliases);
    }

    [Fact]
    public async Task DirtyOnlySync_LeavesOrphanedKeysForTheFullSweep()
    {
        // A delete whose KV write never landed: the tombstone no longer holds the address, so only
        // the full key sweep can find the stray key.
        var aliases = new InMemoryAliasRepository();
        var administration = new InMemoryAdministrationRepository(aliases);
        var kv = new InMemoryKvWriter();
        await kv.PutAsync("deleted@postern.local", "{}", CancellationToken.None);
        var sync = CreateSyncService(administration, aliases, kv);

        var incremental = await sync.SyncAsync(null, CancellationToken.None, fullSync: false);

        Assert.Equal(0, incremental.AliasesDeleted);
        Assert.True(kv.Values.ContainsKey("deleted@postern.local"));

        var full = await sync.SyncAsync(null, CancellationToken.None);

        Assert.True(full.FullSync);
        Assert.Equal(1, full.AliasesDeleted);
        Assert.False(kv.Values.ContainsKey("deleted@postern.local"));
    }

    [Fact]
    public async Task DirtyOnlySync_IgnoresAliasesThatAreNotDirty()
    {
        var aliases = new InMemoryAliasRepository();
        var userId = Guid.NewGuid();
        var alias = SeedAlias(aliases, userId);
        var administration = new InMemoryAdministrationRepository(aliases);
        administration.Aliases.Add(new AdminKvSyncAlias(
            alias.Id,
            alias.FullAddress!,
            userId,
            "destination@example.test",
            "active",
            []));
        var kv = new InMemoryKvWriter();
        var sync = CreateSyncService(administration, aliases, kv);

        var result = await sync.SyncAsync(null, CancellationToken.None, fullSync: false);

        Assert.Equal(0, result.AliasesSynced);
        Assert.False(kv.Values.ContainsKey(alias.FullAddress!.ToLowerInvariant()));
    }

    private static AdminKvSyncService CreateSyncService(
        InMemoryAdministrationRepository administration,
        InMemoryAliasRepository aliases,
        InMemoryKvWriter kv) =>
        new(
            administration,
            aliases,
            new GlobalBlocklistService(administration, kv),
            new SuspendedUserService(new InMemoryAccountRepository { AutoCreateUsers = false }, kv),
            kv,
            TimeProvider.System);

    private static Alias SeedAlias(InMemoryAliasRepository repository, Guid userId)
    {
        var address = $"seeded-{Guid.NewGuid():N}@postern.local";
        var alias = new Alias
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Label = "seeded",
            RandomSuffix = Guid.NewGuid().ToString("N")[..8],
            FullAddress = address,
            FullAddressHash = AliasService.HashAddress(address),
            Category = "personal",
            Status = AliasStatus.Active,
            CreatedAt = DateTimeOffset.UtcNow
        };
        repository.Seed(alias);
        return alias;
    }
}
