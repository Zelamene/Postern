using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Modules;

[Collection(IntegrationCollection.Name)]
public sealed class AdminKvSyncEndpointsTests(PosternFixture fixture) : IAsyncLifetime
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
    public async Task KvSync_RequiresAuthentication()
    {
        using var client = _factory.CreateClient();

        var response = await client.PostAsync("/api/admin/kv-sync", null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task KvSync_RequiresAdminRole()
    {
        var user = await fixture.AUserAsync();
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PostAsync("/api/admin/kv-sync", null);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task KvSync_WritesDirtyAliasClearsTheFlagAndAudits()
    {
        var admin = await fixture.AUserAsync(isAdmin: true);
        var user = await fixture.AUserAsync(forwardingAddress: "forwarding@example.test");
        var alias = await fixture.AnAliasAsync(user.Id, kvDirty: true);
        var kv = new RecordingKvWriter();
        using var factory = new PosternApiFactory(fixture, kv);
        using var client = factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);

        var response = await client.PostAsync("/api/admin/kv-sync", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<KvSyncBody>();
        Assert.NotNull(body);
        Assert.True(body.AliasesSynced >= 1);
        Assert.True(body.GlobalBlocklistRebuilt);
        Assert.True(body.SuspendedUsersRebuilt);

        var record = kv.Get(alias.FullAddress!.ToLowerInvariant());
        Assert.NotNull(record);
        var payload = JsonDocument.Parse(record!).RootElement;
        Assert.Equal("forwarding@example.test", payload.GetProperty("destination").GetString());
        Assert.Equal("active", payload.GetProperty("status").GetString());
        Assert.Equal(user.Id.ToString(), payload.GetProperty("userId").GetString());
        Assert.Empty(payload.GetProperty("blockedSenders").EnumerateArray());

        await using var db = fixture.CreateContext();
        var stored = await db.Aliases.SingleAsync(item => item.Id == alias.Id);
        Assert.False(stored.KvDirty);
        var audit = await db.AdminAuditLog
            .Where(entry => entry.Action == "kv.sync" && entry.AdminUserId == admin.Id)
            .OrderByDescending(entry => entry.CreatedAt)
            .FirstAsync();
        var metadata = JsonDocument.Parse(audit.Metadata!).RootElement;
        Assert.True(metadata.GetProperty("aliasesSynced").GetInt32() >= 1);
        Assert.Equal(0, metadata.GetProperty("aliasesFailed").GetInt32());
    }

    [Fact]
    public async Task KvSync_LeavesAlreadyCleanAliasesUntouched()
    {
        var admin = await fixture.AUserAsync(isAdmin: true);
        var user = await fixture.AUserAsync(forwardingAddress: "forwarding@example.test");
        var alias = await fixture.AnAliasAsync(user.Id, kvDirty: false);
        var kv = new RecordingKvWriter();
        using var factory = new PosternApiFactory(fixture, kv);
        using var client = factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);

        var response = await client.PostAsync("/api/admin/kv-sync", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Null(kv.Get(alias.FullAddress!.ToLowerInvariant()));

        await using var db = fixture.CreateContext();
        Assert.False(await db.Aliases
            .Where(item => item.Id == alias.Id)
            .Select(item => item.KvDirty)
            .SingleAsync());
    }

    [Fact]
    public async Task KvSync_WhenTheWriterFails_LeavesTheAliasDirtyAndReportsFailures()
    {
        var admin = await fixture.AUserAsync(isAdmin: true);
        var user = await fixture.AUserAsync(forwardingAddress: "forwarding@example.test");
        var alias = await fixture.AnAliasAsync(user.Id, kvDirty: true);
        var kv = new RecordingKvWriter { ShouldFail = true };
        using var factory = new PosternApiFactory(fixture, kv);
        using var client = factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);

        var response = await client.PostAsync("/api/admin/kv-sync", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<KvSyncBody>();
        Assert.NotNull(body);
        Assert.Equal(0, body.AliasesSynced);
        Assert.True(body.AliasesFailed >= 1);
        Assert.True(body.RemainingDirtyAliases >= 1);

        await using var db = fixture.CreateContext();
        Assert.True(await db.Aliases
            .Where(item => item.Id == alias.Id)
            .Select(item => item.KvDirty)
            .SingleAsync());
        var audit = await db.AdminAuditLog
            .Where(entry => entry.Action == "kv.sync" && entry.AdminUserId == admin.Id)
            .OrderByDescending(entry => entry.CreatedAt)
            .FirstAsync();
        var metadata = JsonDocument.Parse(audit.Metadata!).RootElement;
        Assert.True(metadata.GetProperty("aliasesFailed").GetInt32() >= 1);
        Assert.False(metadata.GetProperty("globalBlocklistRebuilt").GetBoolean());
    }

    private sealed record KvSyncBody(
        int AliasesSynced,
        int AliasesFailed,
        int RemainingDirtyAliases,
        bool GlobalBlocklistRebuilt,
        bool SuspendedUsersRebuilt);
}
