using Postern.Application.Accounts;
using Postern.Domain.Accounts;
using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public class InviteManagementServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 1, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task GetAdminDashboard_MapsStatusesAndCalculatesSeats()
    {
        var repo = new InMemoryInviteRepository { RegisteredUsers = 10, OutstandingInvites = 3 };
        repo.Invites.AddRange([
            new InviteCode { Id = Guid.NewGuid(), CodeHash = "h1", Email = "a@t.test", EmailNormalized = "A@t.test", CreatedAt = Now, ExpiresAt = Now.AddDays(1), DeliveryStatus = InviteDeliveryStatus.Pending },
            new InviteCode { Id = Guid.NewGuid(), CodeHash = "h2", Email = "b@t.test", EmailNormalized = "B@t.test", CreatedAt = Now, ExpiresAt = Now.AddDays(1), RevokedAt = Now, DeliveryStatus = InviteDeliveryStatus.Pending },
            new InviteCode { Id = Guid.NewGuid(), CodeHash = "h3", Email = "c@t.test", EmailNormalized = "C@t.test", CreatedAt = Now, ExpiresAt = Now.AddDays(1), UsedAt = Now, DeliveryStatus = InviteDeliveryStatus.Sent },
            new InviteCode { Id = Guid.NewGuid(), CodeHash = "h4", Email = "d@t.test", EmailNormalized = "D@t.test", CreatedAt = Now, ExpiresAt = Now.AddDays(-1), DeliveryStatus = InviteDeliveryStatus.Sent },
        ]);
        var service = CreateService(repo);

        var dashboard = await service.GetAdminDashboardAsync(CancellationToken.None);

        Assert.Equal(4, dashboard.Invites.Count);
        Assert.Equal("pending", dashboard.Invites[0].Status);
        Assert.True(dashboard.Invites[0].CanResend);
        Assert.True(dashboard.Invites[0].CanRevoke);
        Assert.Equal(InviteDeliveryStatus.Revoked, dashboard.Invites[1].Status);
        Assert.False(dashboard.Invites[1].CanResend);
        Assert.Equal(InviteDeliveryStatus.Accepted, dashboard.Invites[2].Status);
        Assert.Equal("expired", dashboard.Invites[3].Status);
        Assert.Equal(3, dashboard.OutstandingInvites);
        Assert.Equal(Math.Max(0, AuthenticationService.MaximumUsers - 10 - 3), dashboard.SeatsFree);
    }

    [Fact]
    public async Task RequestInvite_WithValidEmail_AddsNormalizedRequest()
    {
        var repo = new InMemoryInviteRepository();
        var service = CreateService(repo);

        await service.RequestInviteAsync("  User@Example.Test  ", CancellationToken.None);

        var req = Assert.Single(repo.Requests);
        Assert.Equal("User@Example.Test", req.Email);
        Assert.Equal(EmailAddressNormalizer.NormalizeIdentity("User@Example.Test"), req.EmailNormalized);
        Assert.Equal(Now, req.RequestedAt);
    }

    [Fact]
    public async Task RequestInvite_WithInvalidEmail_Throws()
    {
        var service = CreateService(new InMemoryInviteRepository());
        await Assert.ThrowsAsync<ArgumentException>(() => service.RequestInviteAsync("not-an-email", CancellationToken.None));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task FindValidRecipient_WithMissingCode_ReturnsNull(string? code)
    {
        var service = CreateService(new InMemoryInviteRepository());
        Assert.Null(await service.FindValidRecipientAsync(code, CancellationToken.None));
    }

    [Fact]
    public async Task FindValidRecipient_WithOverlongCode_ReturnsNull()
    {
        var service = CreateService(new InMemoryInviteRepository());
        Assert.Null(await service.FindValidRecipientAsync(new string('x', 129), CancellationToken.None));
    }

    [Fact]
    public async Task FindValidRecipient_WithValidCode_QueriesByHash()
    {
        var repo = new InMemoryInviteRepository();
        var code = "postern_invite_abc";
        repo.Invites.Add(new InviteCode { Id = Guid.NewGuid(), CodeHash = AuthenticationService.HashInviteCode(code), Email = "x@test.local", EmailNormalized = "X@test.local", CreatedAt = Now, ExpiresAt = Now.AddDays(1) });
        var service = CreateService(repo);

        var recipient = await service.FindValidRecipientAsync(code, CancellationToken.None);
        Assert.Equal("x@test.local", recipient);
    }

    [Fact]
    public async Task ListPendingDevelopmentInvites_UnprotectsCodes()
    {
        var repo = new InMemoryInviteRepository();
        repo.Outbox.Add(new InviteEmailOutboxMessage { Id = Guid.NewGuid(), InviteId = Guid.NewGuid(), RecipientEmail = "d@test.local", ProtectedInviteCode = "protected:plain-code", InviterName = "Admin", ExpiresAt = Now.AddDays(1), CreatedAt = Now, NextAttemptAt = Now, Status = "pending" });
        var service = CreateService(repo);

        var items = await service.ListPendingDevelopmentInvitesAsync(CancellationToken.None);

        var item = Assert.Single(items);
        Assert.Equal("plain-code", item.Code);
        Assert.Equal("d@test.local", item.Email);
    }

    [Fact]
    public async Task ListPendingRequests_MapsRequests()
    {
        var repo = new InMemoryInviteRepository();
        var id = Guid.NewGuid();
        repo.Requests.Add(new InviteRequest { Id = id, Email = "r@test.local", EmailNormalized = "R@test.local", RequestedAt = Now, Status = "pending" });
        var service = CreateService(repo);

        var items = await service.ListPendingRequestsAsync(CancellationToken.None);

        var item = Assert.Single(items);
        Assert.Equal(id, item.Id);
        Assert.Equal("r@test.local", item.Email);
    }

    [Fact]
    public async Task ApproveRequest_WhenMissing_ReturnsFalse()
    {
        var service = CreateService(new InMemoryInviteRepository());
        Assert.False(await service.ApproveRequestAsync(Guid.NewGuid(), Guid.NewGuid(), "Admin", CancellationToken.None));
    }

    [Fact]
    public async Task ApproveRequest_CreatesInviteAndProtectedOutbox()
    {
        var repo = new InMemoryInviteRepository();
        var requestId = Guid.NewGuid();
        var adminId = Guid.NewGuid();
        repo.Requests.Add(new InviteRequest { Id = requestId, Email = "ok@test.local", EmailNormalized = "OK@test.local", RequestedAt = Now, Status = "pending" });
        var service = CreateService(repo);

        var ok = await service.ApproveRequestAsync(requestId, adminId, "  Sam  ", CancellationToken.None);

        Assert.True(ok);
        var invite = Assert.Single(repo.Invites);
        Assert.Equal("ok@test.local", invite.Email);
        Assert.Equal(InviteDeliveryStatus.Pending, invite.DeliveryStatus);
        Assert.StartsWith("postern_invite_", FakeInviteUnprotect(repo.Outbox.Single().ProtectedInviteCode));
        var outbox = Assert.Single(repo.Outbox);
        Assert.Equal("Sam", outbox.InviterName);
        Assert.Equal(Now.AddDays(7), invite.ExpiresAt);
    }

    [Fact]
    public async Task ApproveRequest_BlankInviterName_Defaults()
    {
        var repo = new InMemoryInviteRepository();
        var requestId = Guid.NewGuid();
        repo.Requests.Add(new InviteRequest { Id = requestId, Email = "ok@test.local", EmailNormalized = "OK@test.local", RequestedAt = Now, Status = "pending" });
        var service = CreateService(repo);

        await service.ApproveRequestAsync(requestId, Guid.NewGuid(), "   ", CancellationToken.None);

        Assert.Equal("An admin", repo.Outbox.Single().InviterName);
    }

    [Fact]
    public async Task RejectRequest_DelegatesToRepository()
    {
        var repo = new InMemoryInviteRepository { RejectResult = true };
        var service = CreateService(repo);
        Assert.True(await service.RejectRequestAsync(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None));
    }

    [Fact]
    public async Task Resend_CreatesNewProtectedOutboxMessage()
    {
        var repo = new InMemoryInviteRepository();
        var inviteId = Guid.NewGuid();
        repo.Invites.Add(new InviteCode { Id = inviteId, CodeHash = "old", Email = "r@test.local", EmailNormalized = "R@test.local", CreatedAt = Now, ExpiresAt = Now.AddDays(1) });
        var service = CreateService(repo);

        var ok = await service.ResendAsync(inviteId, Guid.NewGuid(), "Admin", CancellationToken.None);

        Assert.True(ok);
        var msg = Assert.Single(repo.Outbox);
        Assert.Equal(inviteId, msg.InviteId);
        Assert.NotEqual("old", repo.Invites[0].CodeHash);
        Assert.StartsWith("postern_invite_", FakeInviteUnprotect(msg.ProtectedInviteCode));
    }

    [Fact]
    public async Task Revoke_DelegatesToRepository()
    {
        var repo = new InMemoryInviteRepository { RevokeResult = true };
        var service = CreateService(repo);
        Assert.True(await service.RevokeAsync(Guid.NewGuid(), Guid.NewGuid(), CancellationToken.None));
    }

    [Fact]
    public async Task RecordWebhookEvent_DelegatesToRepository()
    {
        var repo = new InMemoryInviteRepository { WebhookResult = false };
        var service = CreateService(repo);
        Assert.False(await service.RecordWebhookEventAsync("evt1", "email.sent", "msg1", CancellationToken.None));
        Assert.Single(repo.WebhookEvents);
    }

    private static string FakeInviteUnprotect(string protectedCode) => protectedCode["protected:".Length..];

    private static InviteManagementService CreateService(InMemoryInviteRepository repo) =>
        new(repo, new FakeInviteCodeProtector(), new FixedTimeProvider(Now));

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
