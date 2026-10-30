using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Postern.Domain.Aliases;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Modules;

[Collection(IntegrationCollection.Name)]
public sealed class AccountManagementEndpointsTests(PosternFixture fixture) : IAsyncLifetime
{
    private PosternApiFactory _factory = null!;

    public Task InitializeAsync()
    {
        _factory = new PosternApiFactory(fixture);
        return Task.CompletedTask;
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task ChangeForwardingAddress_UpdatesDestinationOnly()
    {
        var user = await fixture.AUserAsync();
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PostAsJsonAsync(
            "/api/users/change-forwarding-address",
            new { newForwardingAddress = "  inbox@example.test  " });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        await using var db = fixture.CreateContext();
        var reloaded = await db.Users.SingleAsync(item => item.Id == user.Id);
        Assert.Equal("inbox@example.test", reloaded.ForwardingAddress);
        Assert.Equal("inbox@example.test", reloaded.EffectiveForwardingAddress);
        Assert.Equal(user.Email, reloaded.Email);
        Assert.Equal(user.NormalizedEmail, reloaded.NormalizedEmail);
    }

    [Fact]
    public async Task ChangeForwardingAddress_RejectsBlankAddress()
    {
        var user = await fixture.AUserAsync();
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PostAsJsonAsync(
            "/api/users/change-forwarding-address",
            new { newForwardingAddress = "   " });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ChangeForwardingAddress_ForMissingAccountReturnsBadRequest()
    {
        using var client = _factory.CreateAuthenticatedClient(Guid.NewGuid(), "ghost@example.test");

        var response = await client.PostAsJsonAsync(
            "/api/users/change-forwarding-address",
            new { newForwardingAddress = "inbox@example.test" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task DeleteAccount_RemovesUserAndTombstonesAliases()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.DeleteAsync("/api/users/me");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        await using var db = fixture.CreateContext();
        Assert.Null(await db.Users.FindAsync(user.Id));
        var tombstone = await db.Aliases.SingleAsync(item => item.Id == alias.Id);
        Assert.Equal(AliasStatus.Deleted, tombstone.Status);
        Assert.Null(tombstone.UserId);
        Assert.Equal(alias.FullAddressHash, tombstone.FullAddressHash);
    }

    [Fact]
    public async Task DeleteAccount_ForMissingAccountReturnsNotFound()
    {
        using var client = _factory.CreateAuthenticatedClient(Guid.NewGuid(), "ghost@example.test");

        var response = await client.DeleteAsync("/api/users/me");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
