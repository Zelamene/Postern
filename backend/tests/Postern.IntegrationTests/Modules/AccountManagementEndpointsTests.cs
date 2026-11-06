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
    public async Task ChangeForwardingAddress_RepublishesAliasKvDestinations()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        var kv = new RecordingKvWriter();
        using var factory = new PosternApiFactory(fixture, kv);
        using var client = factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PostAsJsonAsync(
            "/api/users/change-forwarding-address",
            new { newForwardingAddress = "new-inbox@example.test" });
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        var json = kv.Get(alias.FullAddress!.ToLowerInvariant());
        Assert.NotNull(json);
        var record = System.Text.Json.JsonDocument.Parse(json!).RootElement;
        Assert.Equal("new-inbox@example.test", record.GetProperty("destination").GetString());
        Assert.Equal("active", record.GetProperty("status").GetString());
        Assert.Equal(user.Id.ToString(), record.GetProperty("userId").GetString());
    }

    [Fact]
    public async Task ChangeForwardingAddress_WhenKvWriteFails_MarksAliasDirty()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        var kv = new RecordingKvWriter { ShouldFail = true };
        using var factory = new PosternApiFactory(fixture, kv);
        using var client = factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PostAsJsonAsync(
            "/api/users/change-forwarding-address",
            new { newForwardingAddress = "new-inbox@example.test" });
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        await using var db = fixture.CreateContext();
        Assert.True((await db.Aliases.SingleAsync(item => item.Id == alias.Id)).KvDirty);
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

    [Fact]
    public async Task AccountManagementEndpoints_RequireAuthentication()
    {
        using var client = _factory.CreateClient();

        var change = await client.PostAsJsonAsync(
            "/api/users/change-forwarding-address",
            new { NewForwardingAddress = "verified@example.test" });
        var delete = await client.DeleteAsync("/api/users/me");

        Assert.Equal(HttpStatusCode.Unauthorized, change.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, delete.StatusCode);
    }
}
