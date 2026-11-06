using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Postern.Application.Accounts;
using Postern.Domain.Accounts;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Modules;

[Collection(IntegrationCollection.Name)]
public sealed class InviteLifecycleEndpointsTests(PosternFixture fixture) : IAsyncLifetime
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
    public async Task AdminRejectsPendingRequest_UpdatesDatabaseAndHidesFromPendingList()
    {
        var admin = await fixture.AUserAsync(isAdmin: true);
        var email = $"reject-{Guid.NewGuid():N}@example.test";
        using var publicClient = _factory.CreateClient();
        var requestResponse = await publicClient.PostAsJsonAsync("/api/invite-requests", new { email });
        Assert.Equal(HttpStatusCode.Accepted, requestResponse.StatusCode);

        await using var db = fixture.CreateContext();
        var request = await db.InviteRequests.SingleAsync(
            item => item.EmailNormalized == EmailAddressNormalizer.NormalizeIdentity(email));

        using var adminClient = _factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);
        var reject = await adminClient.PostAsync($"/api/admin/invite-requests/{request.Id}/reject", content: null);

        Assert.Equal(HttpStatusCode.NoContent, reject.StatusCode);

        await using var verifyDb = fixture.CreateContext();
        var reloaded = await verifyDb.InviteRequests.AsNoTracking().SingleAsync(item => item.Id == request.Id);
        Assert.Equal("rejected", reloaded.Status);
        Assert.Equal(admin.Id, reloaded.ReviewedByUserId);
        Assert.NotNull(reloaded.ReviewedAt);
        Assert.False(await verifyDb.InviteCodes.AnyAsync(invite => invite.Email == email));

        var pending = await adminClient.GetFromJsonAsync<PendingRequestsResponse>("/api/admin/invite-requests");
        Assert.DoesNotContain(pending!.Requests, item => item.Id == request.Id);

        var audit = await verifyDb.AdminAuditLog.AnyAsync(
            entry => entry.Action == "invite_request.rejected" && entry.TargetId == request.Id.ToString());
        Assert.True(audit);
    }

    [Fact]
    public async Task AdminRejectsMissingRequest_ReturnsNotFound()
    {
        var admin = await fixture.AUserAsync(isAdmin: true);
        using var adminClient = _factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);

        var response = await adminClient.PostAsync(
            $"/api/admin/invite-requests/{Guid.NewGuid()}/reject",
            content: null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task AdminRevokesIssuedInvite_CancelsOutboxInvalidatesDetailsAndAudits()
    {
        var admin = await fixture.AUserAsync(isAdmin: true);
        var email = $"revoke-{Guid.NewGuid():N}@example.test";
        using var publicClient = _factory.CreateClient();
        Assert.Equal(HttpStatusCode.Accepted,
            (await publicClient.PostAsJsonAsync("/api/invite-requests", new { email })).StatusCode);

        await using var seedDb = fixture.CreateContext();
        var request = await seedDb.InviteRequests.SingleAsync(
            item => item.EmailNormalized == EmailAddressNormalizer.NormalizeIdentity(email));
        using var adminClient = _factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);
        Assert.Equal(HttpStatusCode.Accepted,
            (await adminClient.PostAsync($"/api/admin/invite-requests/{request.Id}/approve", null)).StatusCode);

        await using var approvedDb = fixture.CreateContext();
        var invite = await approvedDb.InviteCodes.SingleAsync(item => item.Email == email);
        var outbox = await approvedDb.InviteEmailOutbox.SingleAsync(item => item.InviteId == invite.Id);
        var protector = _factory.Services.GetRequiredService<IInviteCodeProtector>();
        var plainCode = protector.Unprotect(outbox.ProtectedInviteCode);

        var revoke = await adminClient.PostAsync($"/api/admin/invites/{invite.Id}/revoke", content: null);
        Assert.Equal(HttpStatusCode.NoContent, revoke.StatusCode);

        await using var verifyDb = fixture.CreateContext();
        var reloaded = await verifyDb.InviteCodes.AsNoTracking().SingleAsync(item => item.Id == invite.Id);
        Assert.NotNull(reloaded.RevokedAt);
        Assert.Equal(InviteDeliveryStatus.Revoked, reloaded.DeliveryStatus);

        var cancelledOutbox = await verifyDb.InviteEmailOutbox.AsNoTracking().SingleAsync(item => item.Id == outbox.Id);
        Assert.Equal("cancelled", cancelledOutbox.Status);
        Assert.Equal(string.Empty, cancelledOutbox.ProtectedInviteCode);
        Assert.Equal("Invite revoked before delivery.", cancelledOutbox.LastError);

        var audit = await verifyDb.AdminAuditLog.AnyAsync(
            entry => entry.Action == "invite.revoked" && entry.TargetId == invite.Id.ToString());
        Assert.True(audit);

        var details = await _factory.CreateClient().PostAsJsonAsync(
            "/api/auth/invite-details",
            new { inviteCode = plainCode });
        Assert.Equal(HttpStatusCode.NotFound, details.StatusCode);

        var resend = await adminClient.PostAsync($"/api/admin/invites/{invite.Id}/resend", content: null);
        Assert.Equal(HttpStatusCode.NotFound, resend.StatusCode);
    }

    [Fact]
    public async Task AdminRevokesMissingInvite_ReturnsNotFound()
    {
        var admin = await fixture.AUserAsync(isAdmin: true);
        using var adminClient = _factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);

        var response = await adminClient.PostAsync($"/api/admin/invites/{Guid.NewGuid()}/revoke", content: null);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task AdminInviteActions_RequireAuthentication()
    {
        using var client = _factory.CreateClient();
        var requestId = Guid.NewGuid();
        var inviteId = Guid.NewGuid();

        var responses = await Task.WhenAll(
            client.PostAsync($"/api/admin/invite-requests/{requestId}/approve", null),
            client.PostAsync($"/api/admin/invite-requests/{requestId}/reject", null),
            client.PostAsync($"/api/admin/invites/{inviteId}/resend", null),
            client.PostAsync($"/api/admin/invites/{inviteId}/revoke", null));

        Assert.All(responses, response => Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode));
    }

    [Fact]
    public async Task AdminInviteActions_RejectNonAdminUsers()
    {
        var user = await fixture.AUserAsync();
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);
        var requestId = Guid.NewGuid();
        var inviteId = Guid.NewGuid();

        var responses = await Task.WhenAll(
            client.PostAsync($"/api/admin/invite-requests/{requestId}/approve", null),
            client.PostAsync($"/api/admin/invite-requests/{requestId}/reject", null),
            client.PostAsync($"/api/admin/invites/{inviteId}/resend", null),
            client.PostAsync($"/api/admin/invites/{inviteId}/revoke", null));

        Assert.All(responses, response => Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode));
    }

    [Fact]
    public async Task InviteDetailsRejectExpiredUsedAndRevokedCodes()
    {
        using var client = _factory.CreateClient();
        var now = DateTimeOffset.UtcNow;

        var expiredCode = await SeedInviteCodeAsync(
            $"expired-details-{Guid.NewGuid():N}@example.test",
            expiresAt: now.AddDays(-1));
        var usedCode = await SeedInviteCodeAsync(
            $"used-details-{Guid.NewGuid():N}@example.test",
            expiresAt: now.AddDays(1),
            usedAt: now.AddMinutes(-5));
        var revokedCode = await SeedInviteCodeAsync(
            $"revoked-details-{Guid.NewGuid():N}@example.test",
            expiresAt: now.AddDays(1),
            revokedAt: now.AddMinutes(-5),
            deliveryStatus: InviteDeliveryStatus.Revoked);

        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync("/api/auth/invite-details", new { inviteCode = expiredCode })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync("/api/auth/invite-details", new { inviteCode = usedCode })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound,
            (await client.PostAsJsonAsync("/api/auth/invite-details", new { inviteCode = revokedCode })).StatusCode);
    }

    private async Task<string> SeedInviteCodeAsync(
        string email,
        DateTimeOffset expiresAt,
        DateTimeOffset? usedAt = null,
        DateTimeOffset? revokedAt = null,
        string deliveryStatus = InviteDeliveryStatus.Pending)
    {
        var code = $"postern_invite_{Guid.NewGuid():N}";
        await using var db = fixture.CreateContext();
        db.InviteCodes.Add(new InviteCode
        {
            Id = Guid.NewGuid(),
            CodeHash = AuthenticationService.HashInviteCode(code),
            Email = email,
            EmailNormalized = EmailAddressNormalizer.NormalizeIdentity(email),
            CreatedAt = DateTimeOffset.UtcNow,
            ExpiresAt = expiresAt,
            UsedAt = usedAt,
            RevokedAt = revokedAt,
            DeliveryStatus = deliveryStatus
        });
        await db.SaveChangesAsync();
        return code;
    }

    private sealed record PendingRequestsResponse(IReadOnlyList<PendingRequestItem> Requests);
    private sealed record PendingRequestItem(Guid Id, string Email, DateTimeOffset RequestedAt);
}
