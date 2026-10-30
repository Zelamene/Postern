using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Postern.Domain.Activity;
using Postern.Domain.Aliases;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Flows;

[Collection(IntegrationCollection.Name)]
public sealed class IngestFlowTests(PosternFixture fixture) : IAsyncLifetime
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
    public async Task Ingest_FromExpectedSender_IsAcceptedAndReadableAsUnflagged()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        await AddExpectedSenderAsync(alias.Id, "shop.example");

        using var worker = _factory.CreateClient();
        var ingest = await worker.PostAsJsonAsync("/api/ingest", new
        {
            recipientAddress = alias.FullAddress,
            envelopeSender = "orders@shop.example",
            fromHeader = "Shop <orders@shop.example>",
            subject = "Your order shipped",
            authenticationResult = "pass"
        });
        Assert.Equal(HttpStatusCode.Accepted, ingest.StatusCode);

        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);
        var page = await ReadMessagesAsync(client, alias.Id);

        var message = Assert.Single(page.Items);
        Assert.False(message.IsFlagged);
        Assert.Null(message.FlagReason);
        Assert.Equal("Your order shipped", message.Subject);
        Assert.Equal("pass", message.AuthenticationResult);
        Assert.Equal("orders@shop.example", message.EnvelopeSender);
    }

    [Fact]
    public async Task Ingest_FromUnknownSenderWithPassingAuth_IsFlaggedNotDropped()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        await AddExpectedSenderAsync(alias.Id, "shop.example");

        using var worker = _factory.CreateClient();
        var ingest = await worker.PostAsJsonAsync("/api/ingest", new
        {
            recipientAddress = alias.FullAddress,
            envelopeSender = "attacker@phish.example",
            fromHeader = "Security <security@phish.example>",
            subject = "Verify your account",
            authenticationResult = "pass"
        });
        Assert.Equal(HttpStatusCode.Accepted, ingest.StatusCode);

        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);
        var page = await ReadMessagesAsync(client, alias.Id);

        var message = Assert.Single(page.Items);
        Assert.True(message.IsFlagged);
        Assert.Equal("unexpected_pass", message.FlagReason);
    }

    [Fact]
    public async Task Ingest_ToDisabledAlias_IsBlockedAndReadableInBlockedLog()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id, status: AliasStatus.Disabled);

        using var worker = _factory.CreateClient();
        var ingest = await worker.PostAsJsonAsync("/api/ingest", new
        {
            recipientAddress = alias.FullAddress,
            envelopeSender = "orders@shop.example",
            fromHeader = "Shop <orders@shop.example>",
            subject = "Late delivery",
            authenticationResult = "pass"
        });
        Assert.Equal(HttpStatusCode.OK, ingest.StatusCode);

        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);
        var messages = await ReadMessagesAsync(client, alias.Id);
        Assert.Empty(messages.Items);

        var blocked = await client.GetFromJsonAsync<ActivityPage<BlockedBody>>("/api/messages/blocked");
        var item = Assert.Single(blocked!.Items);
        Assert.Equal("disabled", item.Reason);
        Assert.Equal(alias.Id, item.AliasId);
    }

    [Fact]
    public async Task Ingest_ToUnknownAlias_ReturnsNotFoundAndWritesNothing()
    {
        using var worker = _factory.CreateClient();
        var subject = $"hello-{Guid.NewGuid():N}";
        var ingest = await worker.PostAsJsonAsync("/api/ingest", new
        {
            recipientAddress = $"nobody-{Guid.NewGuid():N}@postern.test",
            envelopeSender = "orders@shop.example",
            fromHeader = "Shop <orders@shop.example>",
            subject,
            authenticationResult = "pass"
        });

        Assert.Equal(HttpStatusCode.NotFound, ingest.StatusCode);

        await using var db = fixture.CreateContext();
        Assert.Equal(0, await db.Messages.CountAsync(message => message.Subject == subject));
    }

    [Fact]
    public async Task Ingest_WithWorkerBlockedDecision_RecordsBlockedMessageWithReason()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);

        using var worker = _factory.CreateClient();
        var ingest = await worker.PostAsJsonAsync("/api/ingest", new
        {
            recipientAddress = alias.FullAddress,
            envelopeSender = "promo@spamco.ru",
            fromHeader = "Promo <promo@spamco.ru>",
            subject = "buy now",
            authenticationResult = "pass",
            blocked = true,
            reason = "global_blocklist"
        });
        Assert.Equal(HttpStatusCode.OK, ingest.StatusCode);

        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);
        var blocked = await client.GetFromJsonAsync<ActivityPage<BlockedBody>>("/api/messages/blocked");
        var item = Assert.Single(blocked!.Items);
        Assert.Equal("global_blocklist", item.Reason);
        Assert.Equal(alias.Id, item.AliasId);

        var messages = await ReadMessagesAsync(client, alias.Id);
        Assert.Empty(messages.Items);
    }

    [Fact]
    public async Task Ingest_WithOverlongBlockReason_TruncatesTo32Characters()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);

        using var worker = _factory.CreateClient();
        var ingest = await worker.PostAsJsonAsync("/api/ingest", new
        {
            recipientAddress = alias.FullAddress,
            envelopeSender = "promo@spamco.ru",
            fromHeader = "Promo <promo@spamco.ru>",
            subject = "buy now",
            authenticationResult = "pass",
            blocked = true,
            reason = new string('r', 40)
        });
        Assert.Equal(HttpStatusCode.OK, ingest.StatusCode);

        await using var db = fixture.CreateContext();
        var stored = await db.BlockedMessages.SingleAsync(message => message.AliasId == alias.Id);
        Assert.Equal(32, stored.Reason.Length);
    }

    [Fact]
    public async Task Ingest_WithWorkerBlockedDecisionAndMissingReason_DefaultsToBlocked()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);

        using var worker = _factory.CreateClient();
        var ingest = await worker.PostAsJsonAsync("/api/ingest", new
        {
            recipientAddress = alias.FullAddress,
            envelopeSender = "promo@spamco.ru",
            fromHeader = "Promo <promo@spamco.ru>",
            subject = "buy now",
            authenticationResult = "pass",
            blocked = true
        });
        Assert.Equal(HttpStatusCode.OK, ingest.StatusCode);

        await using var db = fixture.CreateContext();
        var stored = await db.BlockedMessages.SingleAsync(message => message.AliasId == alias.Id);
        Assert.Equal("blocked", stored.Reason);
    }

    [Fact]
    public async Task Ingest_WithBlockedDecisionForUnknownAlias_ReturnsNotFound()
    {
        using var worker = _factory.CreateClient();
        var ingest = await worker.PostAsJsonAsync("/api/ingest", new
        {
            recipientAddress = $"nobody-{Guid.NewGuid():N}@postern.test",
            envelopeSender = "promo@spamco.ru",
            fromHeader = "Promo <promo@spamco.ru>",
            subject = "buy now",
            authenticationResult = "pass",
            blocked = true,
            reason = "global_blocklist"
        });

        Assert.Equal(HttpStatusCode.NotFound, ingest.StatusCode);
    }

    [Fact]
    public async Task Ingest_WithoutConfiguredSecret_IsRejectedWhenSecretIsSet()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        using var factory = new PosternApiFactory(fixture, ingestSecret: "worker-secret");
        using var worker = factory.CreateClient();

        var payload = new
        {
            recipientAddress = alias.FullAddress,
            envelopeSender = "orders@shop.example",
            fromHeader = "Shop <orders@shop.example>",
            subject = "hello",
            authenticationResult = "pass"
        };

        Assert.Equal(HttpStatusCode.Unauthorized, (await worker.PostAsJsonAsync("/api/ingest", payload)).StatusCode);

        using var wrongHeader = new HttpRequestMessage(HttpMethod.Post, "/api/ingest")
        {
            Content = JsonContent.Create(payload)
        };
        wrongHeader.Headers.Add("X-Postern-Ingest-Secret", "not-the-secret");
        Assert.Equal(HttpStatusCode.Unauthorized, (await worker.SendAsync(wrongHeader)).StatusCode);

        using var correctHeader = new HttpRequestMessage(HttpMethod.Post, "/api/ingest")
        {
            Content = JsonContent.Create(payload)
        };
        correctHeader.Headers.Add("X-Postern-Ingest-Secret", "worker-secret");
        Assert.Equal(HttpStatusCode.Accepted, (await worker.SendAsync(correctHeader)).StatusCode);
    }

    [Fact]
    public async Task Ingest_WhenUserExceedsDailyCap_PublishesRateLimitedMap()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        var kv = new RecordingKvWriter();
        using var factory = new PosternApiFactory(fixture, kv);
        using var worker = factory.CreateClient();

        await using (var db = fixture.CreateContext())
        {
            var now = DateTimeOffset.UtcNow;
            db.Messages.AddRange(Enumerable.Range(0, 501).Select(index => new Message
            {
                Id = Guid.NewGuid(),
                AliasId = alias.Id,
                FromHeader = "Shop <orders@shop.example>",
                EnvelopeSender = "orders@shop.example",
                Subject = $"seeded {index}",
                ReceivedAt = now.AddMinutes(-index),
                AuthenticationResult = "pass"
            }));
            await db.SaveChangesAsync();
        }

        var ingest = await worker.PostAsJsonAsync("/api/ingest", new
        {
            recipientAddress = alias.FullAddress,
            envelopeSender = "orders@shop.example",
            fromHeader = "Shop <orders@shop.example>",
            subject = "one more",
            authenticationResult = "pass"
        });
        Assert.Equal(HttpStatusCode.Accepted, ingest.StatusCode);

        var json = kv.Get("rate_limited_users");
        Assert.NotNull(json);
        var users = System.Text.Json.JsonDocument.Parse(json!).RootElement.GetProperty("users");
        Assert.True(users.TryGetProperty(user.Id.ToString(), out var until));
        Assert.True(until.GetInt64() > DateTimeOffset.UtcNow.ToUnixTimeSeconds());
    }

    [Fact]
    public async Task Ingest_WhenUserIsUnderDailyCap_DoesNotPublishTheUserAsRateLimited()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        var kv = new RecordingKvWriter();
        using var factory = new PosternApiFactory(fixture, kv);
        using var worker = factory.CreateClient();

        var ingest = await worker.PostAsJsonAsync("/api/ingest", new
        {
            recipientAddress = alias.FullAddress,
            envelopeSender = "orders@shop.example",
            fromHeader = "Shop <orders@shop.example>",
            subject = "hello",
            authenticationResult = "pass"
        });
        Assert.Equal(HttpStatusCode.Accepted, ingest.StatusCode);

        var json = kv.Get("rate_limited_users");
        if (json is not null)
        {
            var users = System.Text.Json.JsonDocument.Parse(json).RootElement.GetProperty("users");
            Assert.False(users.TryGetProperty(user.Id.ToString(), out _));
        }
    }

    private async Task AddExpectedSenderAsync(Guid aliasId, string senderEtld1)
    {
        await using var db = fixture.CreateContext();
        db.ExpectedSenders.Add(new ExpectedSender
        {
            Id = Guid.NewGuid(),
            AliasId = aliasId,
            SenderEtld1 = senderEtld1,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();
    }

    private static async Task<ActivityPage<MessageBody>> ReadMessagesAsync(HttpClient client, Guid aliasId)
    {
        var response = await client.GetAsync($"/api/aliases/{aliasId}/messages");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<ActivityPage<MessageBody>>())!;
    }

    private sealed record ActivityPage<T>(IReadOnlyList<T> Items, string? NextCursor);

    private sealed record MessageBody(
        Guid Id,
        Guid AliasId,
        string FromHeader,
        string EnvelopeSender,
        string? Subject,
        DateTimeOffset ReceivedAt,
        string AuthenticationResult,
        bool IsFlagged,
        string? FlagReason);

    private sealed record BlockedBody(
        Guid Id,
        Guid AliasId,
        string FromHeader,
        string? Subject,
        DateTimeOffset ReceivedAt,
        string Reason);
}
