using System.Net;
using System.Net.Http.Json;
using Postern.Domain.Notifications;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Modules;

[Collection(IntegrationCollection.Name)]
public sealed class NotificationEndpointsTests(PosternFixture fixture)
{
    [Fact]
    public async Task AliasCreationRecordsAUserNotification()
    {
        var user = await fixture.AUserAsync();
        using var factory = new PosternApiFactory(fixture);
        using var client = factory.CreateAuthenticatedClient(user.Id, user.Email);

        var create = await client.PostAsJsonAsync("/api/aliases", new
        {
            label = $"notify-{Guid.NewGuid():N}",
            purposeMetadata = "{\"source\":\"notifications\"}"
        });
        Assert.Equal(HttpStatusCode.Created, create.StatusCode);
        var alias = await create.Content.ReadFromJsonAsync<CreatedAlias>();
        Assert.NotNull(alias);

        var inbox = await client.GetFromJsonAsync<NotificationInbox>("/api/notifications");

        Assert.NotNull(inbox);
        var notification = Assert.Single(
            inbox.Notifications,
            item => item.Kind == NotificationKind.AliasCreated);
        Assert.Equal("Alias created", notification.Title);
        Assert.Equal(alias.FullAddress, notification.Body);
        Assert.Equal("/app", notification.Link);
        Assert.Null(notification.ReadAt);
        Assert.True(inbox.UnreadCount >= 1);
    }

    [Fact]
    public async Task MarkReadAndMarkAllReadUpdateUnreadState()
    {
        var user = await fixture.AUserAsync();
        using var factory = new PosternApiFactory(fixture);
        using var client = factory.CreateAuthenticatedClient(user.Id, user.Email);

        await client.PostAsJsonAsync("/api/aliases", new
        {
            label = $"notify-{Guid.NewGuid():N}",
            purposeMetadata = "{\"source\":\"notifications\"}"
        });

        var inbox = await client.GetFromJsonAsync<NotificationInbox>("/api/notifications");
        Assert.NotNull(inbox);
        var target = Assert.Single(inbox.Notifications);

        var mark = await client.PostAsync($"/api/notifications/{target.Id}/read", content: null);
        Assert.Equal(HttpStatusCode.NoContent, mark.StatusCode);

        var afterMark = await client.GetFromJsonAsync<NotificationInbox>("/api/notifications");
        Assert.NotNull(afterMark);
        Assert.NotNull(afterMark.Notifications.Single(item => item.Id == target.Id).ReadAt);
        Assert.Equal(inbox.UnreadCount - 1, afterMark.UnreadCount);

        var repeat = await client.PostAsync($"/api/notifications/{target.Id}/read", content: null);
        Assert.Equal(HttpStatusCode.NotFound, repeat.StatusCode);

        await client.PostAsJsonAsync("/api/aliases", new
        {
            label = $"notify-{Guid.NewGuid():N}",
            purposeMetadata = "{\"source\":\"notifications\"}"
        });

        var readAll = await client.PostAsync("/api/notifications/read-all", content: null);
        Assert.Equal(HttpStatusCode.NoContent, readAll.StatusCode);

        var final = await client.GetFromJsonAsync<NotificationInbox>("/api/notifications");
        Assert.NotNull(final);
        Assert.Equal(0, final.UnreadCount);
        Assert.All(final.Notifications, item => Assert.NotNull(item.ReadAt));
    }

    [Fact]
    public async Task UsersCannotReadAnotherAccountsNotification()
    {
        var owner = await fixture.AUserAsync();
        var other = await fixture.AUserAsync();
        using var factory = new PosternApiFactory(fixture);
        using var ownerClient = factory.CreateAuthenticatedClient(owner.Id, owner.Email);
        using var otherClient = factory.CreateAuthenticatedClient(other.Id, other.Email);

        await ownerClient.PostAsJsonAsync("/api/aliases", new
        {
            label = $"notify-{Guid.NewGuid():N}",
            purposeMetadata = "{\"source\":\"notifications\"}"
        });

        var ownerInbox = await ownerClient.GetFromJsonAsync<NotificationInbox>("/api/notifications");
        Assert.NotNull(ownerInbox);
        var notification = Assert.Single(ownerInbox.Notifications);

        var attempt = await otherClient.PostAsync(
            $"/api/notifications/{notification.Id}/read",
            content: null);
        Assert.Equal(HttpStatusCode.NotFound, attempt.StatusCode);

        var otherInbox = await otherClient.GetFromJsonAsync<NotificationInbox>("/api/notifications");
        Assert.NotNull(otherInbox);
        Assert.DoesNotContain(otherInbox.Notifications, item => item.Id == notification.Id);
    }

    [Fact]
    public async Task AdminNotificationsRequireAnAdminAndRecordInviteRequests()
    {
        var user = await fixture.AUserAsync();
        using var factory = new PosternApiFactory(fixture);
        using var userClient = factory.CreateAuthenticatedClient(user.Id, user.Email);

        var forbidden = await userClient.GetAsync("/api/admin/notifications");
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);

        var email = $"notify-invite-{Guid.NewGuid():N}@example.test";
        using var publicClient = factory.CreateClient();
        var request = await publicClient.PostAsJsonAsync("/api/invite-requests", new { email });
        Assert.Equal(HttpStatusCode.Accepted, request.StatusCode);

        var admin = await fixture.AUserAsync(isAdmin: true);
        using var adminClient = factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);
        var inbox = await adminClient.GetFromJsonAsync<NotificationInbox>("/api/admin/notifications");

        Assert.NotNull(inbox);
        var notification = Assert.Single(
            inbox.Notifications,
            item => item.Kind == NotificationKind.InviteRequested && item.Body == email);
        Assert.Equal("New invite request", notification.Title);
        Assert.Equal("/admin", notification.Link);
    }

    [Fact]
    public async Task AccountAndIngestChangesRecordUserNotifications()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        using var factory = new PosternApiFactory(fixture);
        using var client = factory.CreateAuthenticatedClient(user.Id, user.Email);
        using var worker = factory.CreateClient();

        var forwarding = await client.PostAsJsonAsync(
            "/api/users/change-forwarding-address",
            new { newForwardingAddress = "notify-inbox@example.test" });
        Assert.Equal(HttpStatusCode.NoContent, forwarding.StatusCode);

        var accepted = await worker.PostAsJsonAsync("/api/ingest", new
        {
            recipientAddress = alias.FullAddress,
            envelopeSender = "orders@shop.example",
            fromHeader = "Shop <orders@shop.example>",
            subject = "Notification delivery",
            authenticationResult = "pass"
        });
        Assert.Equal(HttpStatusCode.Accepted, accepted.StatusCode);

        var blocked = await worker.PostAsJsonAsync("/api/ingest", new
        {
            recipientAddress = alias.FullAddress,
            envelopeSender = "promo@spamco.ru",
            fromHeader = "Promo <promo@spamco.ru>",
            subject = "Blocked notification delivery",
            authenticationResult = "pass",
            blocked = true,
            reason = "global_blocklist"
        });
        Assert.Equal(HttpStatusCode.OK, blocked.StatusCode);

        var inbox = await client.GetFromJsonAsync<NotificationInbox>("/api/notifications");
        Assert.NotNull(inbox);
        Assert.Contains(
            inbox.Notifications,
            item => item.Kind == NotificationKind.AccountChanged
                && item.Title == "Forwarding address updated");
        Assert.Contains(
            inbox.Notifications,
            item => item.Kind == NotificationKind.MessageReceived);
        Assert.Contains(
            inbox.Notifications,
            item => item.Kind == NotificationKind.MessageBlocked);
    }

    [Fact]
    public async Task RegistrationRecordsAnInvitationAcceptedAdminNotification()
    {
        using var factory = new PosternApiFactory(fixture);
        using var publicClient = factory.CreateClient();
        var email = $"notify-register-{Guid.NewGuid():N}@example.test";

        var inviteResponse = await publicClient.PostAsJsonAsync("/api/dev/invites", new { email });
        Assert.Equal(HttpStatusCode.Created, inviteResponse.StatusCode);
        var invite = await inviteResponse.Content.ReadFromJsonAsync<DevelopmentInvite>();
        Assert.NotNull(invite);

        var register = await publicClient.PostAsJsonAsync("/api/auth/register", new
        {
            password = "correct horse battery staple",
            inviteCode = invite.Code
        });
        Assert.Equal(HttpStatusCode.Accepted, register.StatusCode);

        var admin = await fixture.AUserAsync(isAdmin: true);
        using var adminClient = factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);
        var inbox = await adminClient.GetFromJsonAsync<NotificationInbox>("/api/admin/notifications");

        Assert.NotNull(inbox);
        Assert.Contains(
            inbox.Notifications,
            item => item.Kind == NotificationKind.InvitationAccepted && item.Body == email);
    }

    private sealed record CreatedAlias(Guid Id, string FullAddress);

    private sealed record NotificationInbox(
        int UnreadCount,
        IReadOnlyList<NotificationItem> Notifications);

    private sealed record NotificationItem(
        Guid Id,
        string Kind,
        string Title,
        string? Body,
        string? Link,
        DateTimeOffset CreatedAt,
        DateTimeOffset? ReadAt);

    private sealed record DevelopmentInvite(string Code, string Email);
}
