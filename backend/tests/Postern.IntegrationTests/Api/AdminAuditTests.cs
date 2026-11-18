using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Postern.Domain.Accounts;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Api;

/// <summary>
/// QR1.3 measured at the event level: shared/admin-audit-events.json declares what each
/// administrative route must emit, and these tests check the declarations against the
/// database. The fixture is shared across the collection and is never reset, so every
/// assertion is scoped by admin id and target id rather than by action alone.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class AdminAuditTests(PosternFixture fixture) : IAsyncLifetime
{
    private PosternApiFactory _factory = null!;
    private Postern.Domain.Accounts.PosternUser _admin = null!;

    public async Task InitializeAsync()
    {
        _factory = new PosternApiFactory(fixture);
        _admin = await fixture.AUserAsync(isAdmin: true);
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task SuspendAndResume_EmitOneEventEachInOrder()
    {
        var target = await fixture.AUserAsync();
        using var client = _factory.CreateAuthenticatedClient(_admin.Id, _admin.Email, isAdmin: true);

        var suspend = await client.PostAsJsonAsync(
            $"/api/admin/users/{target.Id}/suspend",
            new { reason = "audit contract test" });
        Assert.True(suspend.IsSuccessStatusCode, $"Suspend answered {(int)suspend.StatusCode}.");

        var resume = await client.PostAsJsonAsync(
            $"/api/admin/users/{target.Id}/resume",
            new { reason = "audit contract test" });
        Assert.True(resume.IsSuccessStatusCode, $"Resume answered {(int)resume.StatusCode}.");

        var actions = await AuditActionsAsync(target.Id.ToString());
        Assert.Equal(["user.suspend", "user.resume"], actions);
    }

    [Fact]
    public async Task BlocklistAddAndRemove_EmitOneEventEach()
    {
        var domain = $"audit-{Guid.NewGuid():N}.example";
        using var client = _factory.CreateAuthenticatedClient(_admin.Id, _admin.Email, isAdmin: true);

        var add = await client.PostAsJsonAsync(
            "/api/admin/global-blocklist",
            new { domain, reason = "audit contract test" });
        Assert.True(add.IsSuccessStatusCode, $"Add answered {(int)add.StatusCode}.");

        var remove = await client.DeleteAsync($"/api/admin/global-blocklist/{domain}");
        Assert.True(remove.IsSuccessStatusCode, $"Remove answered {(int)remove.StatusCode}.");

        var actions = await AuditActionsAsync(domain);
        Assert.Equal(["global_blocklist.add", "global_blocklist.remove"], actions);
    }

    [Fact]
    public async Task KvSync_EmitsOneEventForTheAdministrator()
    {
        using var client = _factory.CreateAuthenticatedClient(_admin.Id, _admin.Email, isAdmin: true);

        var response = await client.PostAsync("/api/admin/kv-sync", null);
        Assert.True(response.IsSuccessStatusCode, $"kv-sync answered {(int)response.StatusCode}.");

        await using var db = fixture.CreateContext();
        var entries = await db.AdminAuditLog
            .Where(entry => entry.AdminUserId == _admin.Id && entry.Action == "kv.sync")
            .OrderBy(entry => entry.CreatedAt)
            .ToListAsync();

        Assert.Single(entries);
        Assert.Null(entries[0].TargetId);
    }

    [Fact]
    public async Task SuspendedUsersRebuild_EmitsOneEventWithTheProjectedCount()
    {
        using var client = _factory.CreateAuthenticatedClient(_admin.Id, _admin.Email, isAdmin: true);

        var response = await client.PostAsync("/api/admin/suspended-users/rebuild", null);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        await using var db = fixture.CreateContext();
        var entry = await db.AdminAuditLog
            .Where(item => item.AdminUserId == _admin.Id && item.Action == "suspended_users.rebuild")
            .OrderByDescending(item => item.CreatedAt)
            .FirstAsync();

        Assert.NotNull(entry.Metadata);
        Assert.Contains("suspendedUsers", entry.Metadata);
    }

    [Fact]
    public async Task ApproveInviteRequest_EmitsTheThreeDeclaredEvents()
    {
        var request = await fixture.AnInviteRequestAsync(DateTimeOffset.UtcNow.AddHours(-1));
        using var client = _factory.CreateAuthenticatedClient(_admin.Id, _admin.Email, isAdmin: true);
        var startedAt = DateTimeOffset.UtcNow;

        var response = await client.PostAsync(
            $"/api/admin/invite-requests/{request.Id}/approve",
            content: null);
        Assert.True(response.IsSuccessStatusCode, $"Approve answered {(int)response.StatusCode}.");

        await using var db = fixture.CreateContext();
        var entries = await db.AdminAuditLog
            .Where(entry => entry.AdminUserId == _admin.Id && entry.CreatedAt >= startedAt)
            .Where(entry => entry.Action.StartsWith("invite"))
            .OrderBy(entry => entry.CreatedAt)
            .ToListAsync();

        Assert.Equal(
            ["invite.approved", "invite.created", "invite_request.approved"],
            entries.Select(entry => entry.Action).Order(StringComparer.Ordinal).ToArray());
    }

    [Fact]
    public async Task RejectInviteRequest_EmitsOneEvent()
    {
        var request = await fixture.AnInviteRequestAsync(DateTimeOffset.UtcNow.AddHours(-1));
        using var client = _factory.CreateAuthenticatedClient(_admin.Id, _admin.Email, isAdmin: true);

        var response = await client.PostAsync(
            $"/api/admin/invite-requests/{request.Id}/reject",
            content: null);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        Assert.Equal(["invite_request.rejected"], await AuditActionsAsync(request.Id.ToString()));
    }

    [Fact]
    public async Task ResendInvite_EmitsOneEvent()
    {
        var invite = await AnInviteAsync();
        using var client = _factory.CreateAuthenticatedClient(_admin.Id, _admin.Email, isAdmin: true);

        var response = await client.PostAsync($"/api/admin/invites/{invite.Id}/resend", content: null);
        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);

        Assert.Equal(["invite.resent"], await AuditActionsAsync(invite.Id.ToString()));
    }

    [Fact]
    public async Task RevokeInvite_EmitsOneEvent()
    {
        var invite = await AnInviteAsync();
        using var client = _factory.CreateAuthenticatedClient(_admin.Id, _admin.Email, isAdmin: true);

        var response = await client.PostAsync($"/api/admin/invites/{invite.Id}/revoke", content: null);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        Assert.Equal(["invite.revoked"], await AuditActionsAsync(invite.Id.ToString()));
    }

    [Fact]
    public async Task AuditRows_CannotBeUpdatedOrDeleted()
    {
        var entry = await fixture.AnAuditEntryAsync("audit.immutability_probe", adminUserId: _admin.Id);
        await using var db = fixture.CreateContext();

        var update = await Assert.ThrowsAsync<PostgresException>(() =>
            db.Database.ExecuteSqlInterpolatedAsync(
                $"""UPDATE postern.admin_audit_log SET action = {"tampered"} WHERE id = {entry.Id}"""));
        Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, update.SqlState);

        var delete = await Assert.ThrowsAsync<PostgresException>(() =>
            db.Database.ExecuteSqlInterpolatedAsync(
                $"""DELETE FROM postern.admin_audit_log WHERE id = {entry.Id}"""));
        Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, delete.SqlState);

        await using var verify = fixture.CreateContext();
        var stored = await verify.AdminAuditLog.SingleAsync(item => item.Id == entry.Id);
        Assert.Equal("audit.immutability_probe", stored.Action);
    }

    [Fact]
    public async Task DeletingAnAccountNamedOnAuditRows_IsRefused()
    {
        var attributed = await fixture.AUserAsync();
        await fixture.AnAuditEntryAsync(
            "audit.attribution_probe",
            targetId: attributed.Id.ToString(),
            adminUserId: attributed.Id);

        using var attributedClient = _factory.CreateAuthenticatedClient(attributed.Id, attributed.Email);
        var refused = await attributedClient.DeleteAsync("/api/users/me");
        Assert.Equal(HttpStatusCode.Conflict, refused.StatusCode);

        await using var db = fixture.CreateContext();
        Assert.True(await db.Users.AnyAsync(user => user.Id == attributed.Id));

        // A user with no audit attribution still deletes normally.
        var unattributed = await fixture.AUserAsync();
        using var client = _factory.CreateAuthenticatedClient(unattributed.Id, unattributed.Email);
        var deleted = await client.DeleteAsync("/api/users/me");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
    }

    private async Task<InviteCode> AnInviteAsync()
    {
        await using var db = fixture.CreateContext();
        var email = $"audit-invite-{Guid.NewGuid():N}@example.test";
        var invite = new InviteCode
        {
            Id = Guid.NewGuid(),
            CodeHash = $"audit-hash-{Guid.NewGuid():N}",
            Email = email,
            EmailNormalized = email.ToUpperInvariant(),
            CreatedAt = DateTimeOffset.UtcNow,
            ExpiresAt = DateTimeOffset.UtcNow.AddDays(1),
            DeliveryStatus = InviteDeliveryStatus.Pending
        };
        db.InviteCodes.Add(invite);
        await db.SaveChangesAsync();
        return invite;
    }

    private async Task<string[]> AuditActionsAsync(string targetId)
    {
        await using var db = fixture.CreateContext();
        return await db.AdminAuditLog
            .Where(entry => entry.AdminUserId == _admin.Id && entry.TargetId == targetId)
            .OrderBy(entry => entry.CreatedAt)
            .Select(entry => entry.Action)
            .ToArrayAsync();
    }
}
