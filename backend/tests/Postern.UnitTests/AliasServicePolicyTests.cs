using System.Text.Json;
using Postern.Application.Aliases;
using Postern.Domain.Aliases;
using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public class AliasServicePolicyTests
{
    [Fact]
    public async Task Create_UsesConfiguredDomainSeparatorAndSuffixLength()
    {
        var repo = new InMemoryAliasRepository();
        var service = TestAliasService.Create(
            repo,
            TimeProvider.System,
            new InMemoryKvWriter(),
            policy: new AliasPolicy("3xyz.uk", 6));

        var alias = await service.CreateAsync(Guid.NewGuid(), "netflix", "", CancellationToken.None);

        Assert.NotNull(alias);
        Assert.Equal("3xyz.uk", alias!.FullAddress!.Split('@')[1]);
        Assert.StartsWith("netflix.", alias.FullAddress);
        Assert.Equal(6, alias.RandomSuffix!.Length);
        Assert.Equal($"netflix.{alias.RandomSuffix}@3xyz.uk", alias.FullAddress);
    }

    [Fact]
    public async Task Create_PublishesKvRecordWithOwnerDestination()
    {
        var userId = Guid.NewGuid();
        var accounts = new InMemoryAccountRepository { DefaultForwardingAddress = "alex@gmail.test" };
        var kv = new InMemoryKvWriter();
        var service = TestAliasService.Create(
            new InMemoryAliasRepository(),
            TimeProvider.System,
            kv,
            accounts);

        var alias = await service.CreateAsync(userId, "shop", "{}", CancellationToken.None);

        Assert.NotNull(alias);
        var record = JsonDocument.Parse(kv.Values[alias!.FullAddress!.ToLowerInvariant()]).RootElement;
        Assert.Equal("alex@gmail.test", record.GetProperty("destination").GetString());
        Assert.Equal("active", record.GetProperty("status").GetString());
        Assert.Equal(userId.ToString(), record.GetProperty("userId").GetString());
    }

    [Fact]
    public async Task Create_RetriesWhenTheGeneratedAddressIsTombstoned()
    {
        var repo = new InMemoryAliasRepository();
        var attempts = new List<string>();
        repo.TombstoneCheck = hash =>
        {
            attempts.Add(hash);
            return attempts.Count <= 2;
        };

        var service = TestAliasService.Create(repo, TimeProvider.System, new InMemoryKvWriter());
        var alias = await service.CreateAsync(Guid.NewGuid(), "shop", "", CancellationToken.None);

        Assert.NotNull(alias);
        Assert.Equal(3, repo.TombstoneChecks);
        Assert.Single(repo.Aliases);
    }

    [Fact]
    public async Task Create_ReturnsNullWhenEveryGeneratedAddressIsTombstoned()
    {
        var repo = new InMemoryAliasRepository { TombstoneCheck = _ => true };
        var service = TestAliasService.Create(repo, TimeProvider.System, new InMemoryKvWriter());

        var alias = await service.CreateAsync(Guid.NewGuid(), "shop", "", CancellationToken.None);

        Assert.Null(alias);
        Assert.Equal(5, repo.TombstoneChecks);
        Assert.Empty(repo.Aliases);
    }

    [Fact]
    public async Task Create_ReturnsNullWhenTheOwningAccountIsGone()
    {
        var accounts = new InMemoryAccountRepository { AutoCreateUsers = false };
        var service = TestAliasService.Create(
            new InMemoryAliasRepository(),
            TimeProvider.System,
            new InMemoryKvWriter(),
            accounts);

        Assert.Null(await service.CreateAsync(Guid.NewGuid(), "shop", "", CancellationToken.None));
    }

    [Fact]
    public async Task Disable_PublishesDisabledStatusWithCurrentDestination()
    {
        var userId = Guid.NewGuid();
        var accounts = new InMemoryAccountRepository { DefaultForwardingAddress = "alex@gmail.test" };
        var repo = new InMemoryAliasRepository();
        var kv = new InMemoryKvWriter();
        var alias = await SeedAliasAsync(repo, userId);
        var service = TestAliasService.Create(repo, TimeProvider.System, kv, accounts);

        Assert.True(await service.DisableAsync(userId, alias.Id, CancellationToken.None));

        var record = JsonDocument.Parse(kv.Values[alias.FullAddress!.ToLowerInvariant()]).RootElement;
        Assert.Equal("disabled", record.GetProperty("status").GetString());
        Assert.Equal("alex@gmail.test", record.GetProperty("destination").GetString());
    }

    [Fact]
    public async Task Replace_PublishesReplacedStatus()
    {
        var userId = Guid.NewGuid();
        var repo = new InMemoryAliasRepository();
        var kv = new InMemoryKvWriter();
        var alias = await SeedAliasAsync(repo, userId);
        var service = TestAliasService.Create(repo, TimeProvider.System, kv);

        Assert.True(await service.ReplaceAsync(userId, alias.Id, Guid.NewGuid(), CancellationToken.None));

        var record = JsonDocument.Parse(kv.Values[alias.FullAddress!.ToLowerInvariant()]).RootElement;
        Assert.Equal("replaced", record.GetProperty("status").GetString());
    }

    private static Task<Alias> SeedAliasAsync(InMemoryAliasRepository repo, Guid userId)
    {
        var address = $"shop.abcd@{AliasPolicy.DefaultDomain}";
        var alias = new Alias
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Label = "shop",
            RandomSuffix = "abcd",
            FullAddress = address,
            FullAddressHash = AliasService.HashAddress(address),
            Category = "personal",
            Status = AliasStatus.Active,
            CreatedAt = DateTimeOffset.UtcNow
        };

        repo.Seed(alias);
        return Task.FromResult(alias);
    }

}
