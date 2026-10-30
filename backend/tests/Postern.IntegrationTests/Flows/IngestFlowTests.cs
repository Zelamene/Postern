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
        var ingest = await worker.PostAsJsonAsync("/api/ingest", new
        {
            recipientAddress = $"nobody-{Guid.NewGuid():N}@postern.test",
            envelopeSender = "orders@shop.example",
            fromHeader = "Shop <orders@shop.example>",
            subject = "hello",
            authenticationResult = "pass"
        });

        Assert.Equal(HttpStatusCode.NotFound, ingest.StatusCode);

        await using var db = fixture.CreateContext();
        Assert.Equal(0, await db.Messages.CountAsync(message => message.Subject == "hello"));
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
