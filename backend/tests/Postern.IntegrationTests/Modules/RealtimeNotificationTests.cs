using System.Net;
using System.Net.Http.Json;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Modules;

[Collection(IntegrationCollection.Name)]
public sealed class RealtimeNotificationTests(PosternFixture fixture)
{
    [Fact]
    public async Task AliasCreationNotifiesTheOwnerAndAdminOperations()
    {
        var user = await fixture.AUserAsync();
        var userNotifier = new RecordingUserRealtimeNotifier();
        var adminNotifier = new RecordingAdminRealtimeNotifier();
        using var factory = new PosternApiFactory(
            fixture,
            userRealtimeNotifier: userNotifier,
            adminRealtimeNotifier: adminNotifier);
        using var client = factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PostAsJsonAsync("/api/aliases", new
        {
            label = $"realtime-{Guid.NewGuid():N}",
            purposeMetadata = "{\"source\":\"realtime\"}"
        });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Contains(user.Id, userNotifier.AliasesChanged);
        Assert.Equal(1, adminNotifier.OperationsChangedCount);
    }

    [Fact]
    public async Task AliasDisableNotifiesTheOwnerAndAdminOperations()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        var userNotifier = new RecordingUserRealtimeNotifier();
        var adminNotifier = new RecordingAdminRealtimeNotifier();
        using var factory = new PosternApiFactory(
            fixture,
            userRealtimeNotifier: userNotifier,
            adminRealtimeNotifier: adminNotifier);
        using var client = factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PatchAsync($"/api/aliases/{alias.Id}/disable", content: null);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Contains(user.Id, userNotifier.AliasesChanged);
        Assert.Equal(1, adminNotifier.OperationsChangedCount);
    }

    [Fact]
    public async Task AcceptedIngestNotifiesTheOwnerAndAdminOperations()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        var userNotifier = new RecordingUserRealtimeNotifier();
        var adminNotifier = new RecordingAdminRealtimeNotifier();
        using var factory = new PosternApiFactory(
            fixture,
            userRealtimeNotifier: userNotifier,
            adminRealtimeNotifier: adminNotifier);
        using var worker = factory.CreateClient();

        var response = await worker.PostAsJsonAsync("/api/ingest", new
        {
            recipientAddress = alias.FullAddress,
            envelopeSender = "orders@shop.example",
            fromHeader = "Shop <orders@shop.example>",
            subject = "Realtime delivery",
            authenticationResult = "pass"
        });

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        Assert.Contains((user.Id, alias.Id), userNotifier.Messages);
        Assert.Equal(1, adminNotifier.OperationsChangedCount);
    }

    [Fact]
    public async Task BlockedIngestNotifiesTheOwnerAndAdminOperations()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        var userNotifier = new RecordingUserRealtimeNotifier();
        var adminNotifier = new RecordingAdminRealtimeNotifier();
        using var factory = new PosternApiFactory(
            fixture,
            userRealtimeNotifier: userNotifier,
            adminRealtimeNotifier: adminNotifier);
        using var worker = factory.CreateClient();

        var response = await worker.PostAsJsonAsync("/api/ingest", new
        {
            recipientAddress = alias.FullAddress,
            envelopeSender = "promo@spamco.ru",
            fromHeader = "Promo <promo@spamco.ru>",
            subject = "Blocked delivery",
            authenticationResult = "pass",
            blocked = true,
            reason = "global_blocklist"
        });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains((user.Id, alias.Id), userNotifier.BlockedMessages);
        Assert.Empty(userNotifier.Messages);
        Assert.Equal(1, adminNotifier.OperationsChangedCount);
    }

    [Fact]
    public async Task DuplicateIngestDoesNotPublishNotifications()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        var messageId = $"<realtime-{Guid.NewGuid():N}@shop.example>";
        var userNotifier = new RecordingUserRealtimeNotifier();
        var adminNotifier = new RecordingAdminRealtimeNotifier();
        using var factory = new PosternApiFactory(
            fixture,
            userRealtimeNotifier: userNotifier,
            adminRealtimeNotifier: adminNotifier);
        using var worker = factory.CreateClient();

        var payload = new
        {
            recipientAddress = alias.FullAddress,
            envelopeSender = "orders@shop.example",
            fromHeader = "Shop <orders@shop.example>",
            subject = "Only once",
            authenticationResult = "pass",
            messageId
        };

        var first = await worker.PostAsJsonAsync("/api/ingest", payload);
        var duplicate = await worker.PostAsJsonAsync("/api/ingest", payload);

        Assert.Equal(HttpStatusCode.Accepted, first.StatusCode);
        Assert.Equal(HttpStatusCode.OK, duplicate.StatusCode);
        Assert.Single(userNotifier.Messages);
        Assert.Equal(1, adminNotifier.OperationsChangedCount);
    }

    [Fact]
    public async Task SuspendNotifiesTheAffectedAccountAndAdminOperations()
    {
        var admin = await fixture.AUserAsync(isAdmin: true);
        var user = await fixture.AUserAsync();
        var userNotifier = new RecordingUserRealtimeNotifier();
        var adminNotifier = new RecordingAdminRealtimeNotifier();
        using var factory = new PosternApiFactory(
            fixture,
            userRealtimeNotifier: userNotifier,
            adminRealtimeNotifier: adminNotifier);
        using var client = factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);

        var response = await client.PostAsJsonAsync(
            $"/api/admin/users/{user.Id}/suspend",
            new { reason = "Realtime verification" });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Contains(user.Id, userNotifier.AccountChanged);
        Assert.Equal(1, adminNotifier.OperationsChangedCount);
    }

    [Fact]
    public async Task KvSyncNotifiesAdminOperations()
    {
        var admin = await fixture.AUserAsync(isAdmin: true);
        var adminNotifier = new RecordingAdminRealtimeNotifier();
        using var factory = new PosternApiFactory(fixture, adminRealtimeNotifier: adminNotifier);
        using var client = factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);

        var response = await client.PostAsync("/api/admin/kv-sync", content: null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, adminNotifier.OperationsChangedCount);
    }

    [Fact]
    public async Task ForwardingAddressChangeNotifiesTheAccount()
    {
        var user = await fixture.AUserAsync();
        var userNotifier = new RecordingUserRealtimeNotifier();
        using var factory = new PosternApiFactory(fixture, userRealtimeNotifier: userNotifier);
        using var client = factory.CreateAuthenticatedClient(user.Id, user.Email);
        factory.Destinations.MarkVerified("realtime-inbox@example.test");

        var response = await client.PostAsJsonAsync(
            "/api/users/change-forwarding-address",
            new { newForwardingAddress = "realtime-inbox@example.test" });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.Contains(user.Id, userNotifier.AccountChanged);
    }
}
