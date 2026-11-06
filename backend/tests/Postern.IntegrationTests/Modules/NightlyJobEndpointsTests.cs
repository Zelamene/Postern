using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Postern.Api.Endpoints;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Modules;

[Collection(IntegrationCollection.Name)]
public sealed class NightlyJobEndpointsTests(PosternFixture fixture)
{
    private const string JobSecret = PosternApiFactory.DefaultJobSecret;

    [Fact]
    public async Task Nightly_WhenTheSecretIsNotConfigured_ReturnsServiceUnavailable()
    {
        using var factory = new PosternApiFactory(fixture);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/api/jobs/nightly", null);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    }

    [Fact]
    public async Task Nightly_WithoutTheSecret_ReturnsUnauthorized()
    {
        using var factory = new PosternApiFactory(fixture, jobSecret: JobSecret);
        using var client = factory.CreateClient();

        var response = await client.PostAsync("/api/jobs/nightly", null);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Nightly_WithTheWrongSecret_ReturnsUnauthorized()
    {
        using var factory = new PosternApiFactory(fixture, jobSecret: JobSecret);
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/jobs/nightly");
        request.Headers.Add(JobEndpoints.SecretHeaderName, "wrong-secret");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Nightly_WithTheSecret_AppliesRetentionSyncsKvAndAudits()
    {
        var now = DateTimeOffset.UtcNow;
        var user = await fixture.AUserAsync(forwardingAddress: "forwarding@example.test");
        var alias = await fixture.AnAliasAsync(user.Id, kvDirty: true);
        var oldMessage = await fixture.AMessageAsync(alias.Id, receivedAt: now.AddDays(-91));
        var recentMessage = await fixture.AMessageAsync(alias.Id, receivedAt: now.AddDays(-1));
        var oldBlocked = await fixture.ABlockedMessageAsync(alias.Id, receivedAt: now.AddDays(-91));
        var recentBlocked = await fixture.ABlockedMessageAsync(alias.Id, receivedAt: now.AddDays(-1));
        var oldWebhook = await fixture.AWebhookEventAsync(now.AddDays(-31));
        var recentWebhook = await fixture.AWebhookEventAsync(now.AddDays(-29));
        var oldPendingRequest = await fixture.AnInviteRequestAsync(now.AddDays(-31));
        var recentPendingRequest = await fixture.AnInviteRequestAsync(now.AddDays(-29));
        var oldApprovedRequest = await fixture.AnInviteRequestAsync(now.AddDays(-31), status: "approved");

        using var factory = new PosternApiFactory(fixture, jobSecret: JobSecret);
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/jobs/nightly");
        request.Headers.Add(JobEndpoints.SecretHeaderName, JobSecret);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<NightlyJobBody>();
        Assert.NotNull(body);
        Assert.True(body.DeletedMessages >= 1);
        Assert.True(body.DeletedBlockedMessages >= 1);
        Assert.True(body.DeletedWebhookEvents >= 1);
        Assert.True(body.DeletedInviteRequests >= 1);
        Assert.True(body.KvSync.AliasesSynced >= 1);

        await using var db = fixture.CreateContext();
        Assert.False(await db.Messages.AnyAsync(message => message.Id == oldMessage.Id));
        Assert.True(await db.Messages.AnyAsync(message => message.Id == recentMessage.Id));
        Assert.False(await db.BlockedMessages.AnyAsync(message => message.Id == oldBlocked.Id));
        Assert.True(await db.BlockedMessages.AnyAsync(message => message.Id == recentBlocked.Id));
        Assert.False(await db.ResendWebhookEvents.AnyAsync(item => item.Id == oldWebhook.Id));
        Assert.True(await db.ResendWebhookEvents.AnyAsync(item => item.Id == recentWebhook.Id));
        Assert.False(await db.InviteRequests.AnyAsync(item => item.Id == oldPendingRequest.Id));
        Assert.True(await db.InviteRequests.AnyAsync(item => item.Id == recentPendingRequest.Id));
        Assert.True(await db.InviteRequests.AnyAsync(item => item.Id == oldApprovedRequest.Id));
        Assert.False(await db.Aliases
            .Where(item => item.Id == alias.Id)
            .Select(item => item.KvDirty)
            .SingleAsync());

        var audit = await db.AdminAuditLog
            .Where(entry => entry.Action == "job.nightly")
            .OrderByDescending(entry => entry.CreatedAt)
            .FirstAsync();
        Assert.Null(audit.AdminUserId);
        var metadata = System.Text.Json.JsonDocument.Parse(audit.Metadata!).RootElement;
        Assert.True(metadata.GetProperty("deletedMessages").GetInt32() >= 1);
        Assert.True(metadata.GetProperty("deletedBlockedMessages").GetInt32() >= 1);
        Assert.True(metadata.GetProperty("deletedWebhookEvents").GetInt32() >= 1);
        Assert.True(metadata.GetProperty("deletedInviteRequests").GetInt32() >= 1);
        Assert.True(metadata.GetProperty("aliasesSynced").GetInt32() >= 1);
    }

    private sealed record NightlyJobBody(
        int DeletedMessages,
        int DeletedBlockedMessages,
        int DeletedWebhookEvents,
        int DeletedInviteRequests,
        NightlyKvSyncBody KvSync);

    private sealed record NightlyKvSyncBody(
        int AliasesSynced,
        int AliasesFailed,
        int RemainingDirtyAliases,
        bool GlobalBlocklistRebuilt,
        bool SuspendedUsersRebuilt);
}
