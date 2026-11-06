using Microsoft.EntityFrameworkCore;
using Postern.Domain.Aliases;
using Postern.Infrastructure.Accounts;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Infrastructure;

[Collection(IntegrationCollection.Name)]
public sealed class AccountRepositoryTests(PosternFixture fixture)
{
    [Fact]
    public async Task UpdateForwardingAddress_ChangesDestinationOnly()
    {
        var user = await fixture.AUserAsync();

        await using var db = fixture.CreateContext();
        var repo = new EfAccountRepository(db, allowUnboundDevelopmentInvites: false);

        Assert.True(await repo.UpdateForwardingAddressAsync(user.Id, "inbox@example.test", CancellationToken.None));

        db.ChangeTracker.Clear();
        var reloaded = await db.Users.SingleAsync(item => item.Id == user.Id);
        Assert.Equal("inbox@example.test", reloaded.ForwardingAddress);
        Assert.Equal("inbox@example.test", reloaded.EffectiveForwardingAddress);

        // The login identity is immutable; only the forwarding destination moves.
        Assert.Equal(user.Email, reloaded.Email);
        Assert.Equal(user.NormalizedEmail, reloaded.NormalizedEmail);
        Assert.NotNull(await repo.FindByNormalizedEmailAsync(user.NormalizedEmail, CancellationToken.None));
    }

    [Fact]
    public async Task EffectiveForwardingAddress_FallsBackToLoginEmail()
    {
        var user = await fixture.AUserAsync();

        await using var db = fixture.CreateContext();
        var reloaded = await db.Users.SingleAsync(item => item.Id == user.Id);

        Assert.Null(reloaded.ForwardingAddress);
        Assert.Equal(user.Email, reloaded.EffectiveForwardingAddress);
    }

    [Fact]
    public async Task UpdateForwardingAddress_ReturnsFalse_ForUnknownUser()
    {
        await using var db = fixture.CreateContext();
        var repo = new EfAccountRepository(db, allowUnboundDevelopmentInvites: false);

        Assert.False(await repo.UpdateForwardingAddressAsync(
            Guid.NewGuid(), "inbox@example.test", CancellationToken.None));
    }

    [Fact]
    public async Task DeleteAccount_RemovesUserAndTombstonesAliases()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);

        await using var db = fixture.CreateContext();
        var repo = new EfAccountRepository(db, allowUnboundDevelopmentInvites: false);

        Assert.True(await repo.DeleteAccountAsync(user.Id, DateTimeOffset.UtcNow, CancellationToken.None));

        db.ChangeTracker.Clear();
        Assert.Null(await db.Users.FindAsync(user.Id));

        var tombstoned = await db.Aliases.FindAsync(alias.Id);
        Assert.NotNull(tombstoned);
        Assert.Equal(AliasStatus.Deleted, tombstoned.Status);
        Assert.Null(tombstoned.UserId);
        Assert.Equal(alias.FullAddressHash, tombstoned.FullAddressHash);
        Assert.NotNull(tombstoned.DeletedAt);
    }

    [Fact]
    public async Task DeleteAccount_ReturnsFalse_ForUnknownUser()
    {
        await using var db = fixture.CreateContext();
        var repo = new EfAccountRepository(db, allowUnboundDevelopmentInvites: false);

        Assert.False(await repo.DeleteAccountAsync(Guid.NewGuid(), DateTimeOffset.UtcNow, CancellationToken.None));
    }
}
