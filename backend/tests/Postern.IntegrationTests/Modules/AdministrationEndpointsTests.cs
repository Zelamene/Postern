using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Modules;

[Collection(IntegrationCollection.Name)]
public sealed class AdministrationEndpointsTests(PosternFixture fixture) : IAsyncLifetime
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
    public async Task RebuildSuspendedUsers_RequiresAdminRole()
    {
        var user = await fixture.AUserAsync();
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PostAsync("/api/admin/suspended-users/rebuild", null);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task RebuildSuspendedUsers_RequiresAuthentication()
    {
        using var client = _factory.CreateClient();

        var response = await client.PostAsync("/api/admin/suspended-users/rebuild", null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task RebuildSuspendedUsers_PublishesSuspendedMapOnly()
    {
        var admin = await fixture.AUserAsync(isAdmin: true);
        var suspended = await fixture.AUserAsync(status: "suspended");
        var active = await fixture.AUserAsync();
        var kv = new RecordingKvWriter();
        using var factory = new PosternApiFactory(fixture, kv);
        using var client = factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);

        var response = await client.PostAsync("/api/admin/suspended-users/rebuild", null);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var users = ReadSuspendedUsers(kv);
        Assert.True(users.GetProperty(suspended.Id.ToString()).GetBoolean());
        Assert.False(users.TryGetProperty(active.Id.ToString(), out _));
        Assert.False(users.TryGetProperty(admin.Id.ToString(), out _));
    }

    [Fact]
    public async Task SuspendUser_SetsStatusPublishesMapAndAudits()
    {
        var admin = await fixture.AUserAsync(isAdmin: true);
        var target = await fixture.AUserAsync();
        var kv = new RecordingKvWriter();
        using var factory = new PosternApiFactory(fixture, kv);
        using var client = factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);

        var response = await client.PostAsJsonAsync(
            $"/api/admin/users/{target.Id}/suspend",
            new { reason = "abuse report" });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal("suspended", await ReadStatusAsync(target.Id));
        Assert.True(ReadSuspendedUsers(kv).GetProperty(target.Id.ToString()).GetBoolean());

        await using var db = fixture.CreateContext();
        var audit = await db.AdminAuditLog.SingleAsync(
            entry => entry.Action == "user.suspend" && entry.TargetId == target.Id.ToString());
        Assert.Equal(admin.Id, audit.AdminUserId);
        Assert.Contains("abuse report", audit.Metadata);
    }

    [Fact]
    public async Task SuspendUser_WhenUserIsMissing_ReturnsNotFound()
    {
        var admin = await fixture.AUserAsync(isAdmin: true);
        using var client = _factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);

        var response = await client.PostAsJsonAsync(
            $"/api/admin/users/{Guid.NewGuid()}/suspend",
            new { reason = "unknown" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task SuspendUser_ForNonAdmin_ReturnsForbidden()
    {
        var user = await fixture.AUserAsync();
        var target = await fixture.AUserAsync();
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PostAsJsonAsync(
            $"/api/admin/users/{target.Id}/suspend",
            new { reason = "self service" });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal("active", await ReadStatusAsync(target.Id));
    }

    [Fact]
    public async Task ResumeUser_ReactivatesUserAndClearsSuspendedMap()
    {
        var admin = await fixture.AUserAsync(isAdmin: true);
        var target = await fixture.AUserAsync(status: "suspended");
        var kv = new RecordingKvWriter();
        using var factory = new PosternApiFactory(fixture, kv);
        using var client = factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);
        await client.PostAsync("/api/admin/suspended-users/rebuild", null);
        Assert.True(ReadSuspendedUsers(kv).TryGetProperty(target.Id.ToString(), out _));

        var response = await client.PostAsJsonAsync(
            $"/api/admin/users/{target.Id}/resume",
            new { reason = "appeal accepted" });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Equal("active", await ReadStatusAsync(target.Id));
        Assert.False(ReadSuspendedUsers(kv).TryGetProperty(target.Id.ToString(), out _));

        await using var db = fixture.CreateContext();
        Assert.True(await db.AdminAuditLog.AnyAsync(
            entry => entry.Action == "user.resume" && entry.TargetId == target.Id.ToString()));
    }

    [Fact]
    public async Task BlockDomain_StoresAndPublishesTheNormalizedDomain()
    {
        var admin = await fixture.AUserAsync(isAdmin: true);
        var kv = new RecordingKvWriter();
        using var factory = new PosternApiFactory(fixture, kv);
        using var client = factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);

        var response = await client.PostAsJsonAsync(
            "/api/admin/global-blocklist",
            new { domain = "Mail.Spamco.co.uk", reason = "phishing" });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Contains("spamco.co.uk", ReadBlockedDomains(kv));

        await using var db = fixture.CreateContext();
        var stored = await db.GlobalBlocklist.SingleAsync(domain => domain.DomainEtld1 == "spamco.co.uk");
        Assert.Equal(admin.Id, stored.AddedByAdminUserId);
        Assert.Equal("phishing", stored.Reason);
        Assert.True(await db.AdminAuditLog.AnyAsync(
            entry => entry.Action == "global_blocklist.add" && entry.TargetId == "spamco.co.uk"));
    }

    [Fact]
    public async Task BlockDomain_WithoutADomain_ReturnsBadRequest()
    {
        var admin = await fixture.AUserAsync(isAdmin: true);
        using var client = _factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);

        var response = await client.PostAsJsonAsync("/api/admin/global-blocklist", new { reason = "no domain" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task UnblockDomain_RemovesTheRowAndRepublishesTheRemainingDomains()
    {
        var admin = await fixture.AUserAsync(isAdmin: true);
        var kv = new RecordingKvWriter();
        using var factory = new PosternApiFactory(fixture, kv);
        using var client = factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);
        await client.PostAsJsonAsync("/api/admin/global-blocklist", new { domain = "keep.ru", reason = "spam" });
        await client.PostAsJsonAsync("/api/admin/global-blocklist", new { domain = "drop.ru", reason = "spam" });

        var response = await client.DeleteAsync("/api/admin/global-blocklist/drop.ru");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        var published = ReadBlockedDomains(kv);
        Assert.Contains("keep.ru", published);
        Assert.DoesNotContain("drop.ru", published);

        await using var db = fixture.CreateContext();
        Assert.False(await db.GlobalBlocklist.AnyAsync(domain => domain.DomainEtld1 == "drop.ru"));
        Assert.True(await db.AdminAuditLog.AnyAsync(
            entry => entry.Action == "global_blocklist.remove" && entry.TargetId == "drop.ru"));
    }

    [Fact]
    public async Task UnblockDomain_WhenTheDomainIsNotBlocked_ReturnsNotFound()
    {
        var admin = await fixture.AUserAsync(isAdmin: true);
        using var client = _factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);

        var response = await client.DeleteAsync("/api/admin/global-blocklist/absent.ru");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task ListBlockedDomains_ReturnsTheBlockedDomains()
    {
        var admin = await fixture.AUserAsync(isAdmin: true);
        using var client = _factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);
        await client.PostAsJsonAsync("/api/admin/global-blocklist", new { domain = "listed.ru", reason = "spam" });

        var response = await client.GetAsync("/api/admin/global-blocklist");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<BlockedDomainsBody>();
        Assert.Contains("listed.ru", body!.Domains);
        var entry = Assert.Single(body.Entries, item => item.Domain == "listed.ru");
        Assert.Equal("spam", entry.Reason);
        Assert.NotEqual(default, entry.CreatedAt);
    }

    [Fact]
    public async Task GlobalBlocklist_RequiresAdminRole()
    {
        var user = await fixture.AUserAsync();
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.GetAsync("/api/admin/global-blocklist");

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    private async Task<string?> ReadStatusAsync(Guid userId)
    {
        await using var db = fixture.CreateContext();
        return await db.Users
            .Where(user => user.Id == userId)
            .Select(user => user.Status)
            .SingleOrDefaultAsync();
    }

    private static JsonElement ReadSuspendedUsers(RecordingKvWriter kv)
    {
        var json = kv.Get("suspended_users");
        Assert.NotNull(json);
        return JsonDocument.Parse(json!).RootElement.GetProperty("users");
    }

    private static List<string> ReadBlockedDomains(RecordingKvWriter kv)
    {
        var json = kv.Get("__global_blocklist");
        Assert.NotNull(json);
        return JsonDocument.Parse(json!)
            .RootElement
            .GetProperty("domains")
            .EnumerateArray()
            .Select(item => item.GetString()!)
            .ToList();
    }

    private sealed record BlockedDomainsBody(
        IReadOnlyList<string> Domains,
        IReadOnlyList<BlockedDomainEntry> Entries);

    private sealed record BlockedDomainEntry(string Domain, string Reason, DateTimeOffset CreatedAt);
}
