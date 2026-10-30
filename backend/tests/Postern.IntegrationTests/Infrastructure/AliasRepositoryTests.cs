using Microsoft.EntityFrameworkCore;
using Postern.Domain.Aliases;
using Postern.Infrastructure.Aliases;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Infrastructure;

[Collection(IntegrationCollection.Name)]
public sealed class AliasRepositoryTests(PosternFixture fixture)
{
    [Fact]
    public async Task Disable_MovesActiveAliasToDisabled()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);

        await using var db = fixture.CreateContext();
        var repo = new EfAliasRepository(db);

        Assert.True(await repo.UpdateStatusAsync(
            alias.Id, user.Id, AliasStatus.Disabled, DateTimeOffset.UtcNow, CancellationToken.None));

        db.ChangeTracker.Clear();
        Assert.Equal(AliasStatus.Disabled, (await db.Aliases.FindAsync(alias.Id))!.Status);
    }

    [Fact]
    public async Task Disable_IsIdempotentlyRejectedWhenAlreadyDisabled()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id, status: AliasStatus.Disabled);

        await using var db = fixture.CreateContext();
        var repo = new EfAliasRepository(db);

        Assert.False(await repo.UpdateStatusAsync(
            alias.Id, user.Id, AliasStatus.Disabled, DateTimeOffset.UtcNow, CancellationToken.None));
    }

    [Fact]
    public async Task MarkReplaced_RecordsReplacementLink()
    {
        var user = await fixture.AUserAsync();
        var original = await fixture.AnAliasAsync(user.Id, label: "orig");
        var replacement = await fixture.AnAliasAsync(user.Id, label: "repl");

        await using var db = fixture.CreateContext();
        var repo = new EfAliasRepository(db);

        Assert.True(await repo.MarkReplacedAsync(
            original.Id, user.Id, replacement.Id, DateTimeOffset.UtcNow, CancellationToken.None));

        db.ChangeTracker.Clear();
        var reloaded = await db.Aliases.FindAsync(original.Id);
        Assert.Equal(AliasStatus.Replaced, reloaded!.Status);
        Assert.Equal(replacement.Id, reloaded.ReplacedByAliasId);
    }

    [Fact]
    public async Task Delete_KeepsHashAndClearsPersonalData()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);

        await using var db = fixture.CreateContext();
        var repo = new EfAliasRepository(db);

        Assert.True(await repo.DeleteAsync(
            alias.Id, user.Id, DateTimeOffset.UtcNow, CancellationToken.None));

        db.ChangeTracker.Clear();
        var tombstoned = await db.Aliases.FindAsync(alias.Id);
        Assert.Equal(AliasStatus.Deleted, tombstoned!.Status);
        Assert.Null(tombstoned.UserId);
        Assert.Null(tombstoned.FullAddress);
        Assert.Null(tombstoned.Label);
        Assert.Equal(alias.FullAddressHash, tombstoned.FullAddressHash);
        Assert.True(await repo.IsAddressHashTombstonedAsync(alias.FullAddressHash, CancellationToken.None));
    }

    [Fact]
    public async Task ListByUser_ExcludesOtherUsersAliases()
    {
        var owner = await fixture.AUserAsync();
        var stranger = await fixture.AUserAsync();
        var owned = await fixture.AnAliasAsync(owner.Id);
        var foreign = await fixture.AnAliasAsync(stranger.Id);

        await using var db = fixture.CreateContext();
        var repo = new EfAliasRepository(db);

        var list = await repo.ListByUserAsync(owner.Id, CancellationToken.None);

        Assert.Contains(list, item => item.Id == owned.Id);
        Assert.DoesNotContain(list, item => item.Id == foreign.Id);
    }

    [Fact]
    public async Task GetOwnedAlias_ReturnsNullForForeignAlias()
    {
        var owner = await fixture.AUserAsync();
        var stranger = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(owner.Id);

        await using var db = fixture.CreateContext();
        var repo = new EfAliasRepository(db);

        Assert.Null(await repo.GetOwnedAliasAsync(alias.Id, stranger.Id, CancellationToken.None));
        Assert.NotNull(await repo.GetOwnedAliasAsync(alias.Id, owner.Id, CancellationToken.None));
    }

    [Fact]
    public async Task MarkKvDirty_FlagsAliasForWorkerSync()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);

        await using var db = fixture.CreateContext();
        var repo = new EfAliasRepository(db);
        await repo.MarkKvDirtyAsync(alias.Id, CancellationToken.None);

        db.ChangeTracker.Clear();
        Assert.True((await db.Aliases.FindAsync(alias.Id))!.KvDirty);
    }

    [Fact]
    public async Task Create_RejectsDuplicateAddressHash()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);

        await using var db = fixture.CreateContext();
        var repo = new EfAliasRepository(db);

        var duplicate = new Alias
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Label = "duplicate",
            RandomSuffix = "abcd1234",
            FullAddress = $"{Guid.NewGuid():N}@postern.test",
            FullAddressHash = alias.FullAddressHash,
            Category = "personal",
            Status = AliasStatus.Active,
            CreatedAt = DateTimeOffset.UtcNow
        };

        await Assert.ThrowsAsync<DbUpdateException>(() => repo.CreateAsync(duplicate, CancellationToken.None));
    }
}
