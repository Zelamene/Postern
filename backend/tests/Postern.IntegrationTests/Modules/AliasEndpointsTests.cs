using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Postern.Domain.Activity;
using Postern.Domain.Aliases;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Modules;

[Collection(IntegrationCollection.Name)]
public sealed class AliasEndpointsTests(PosternFixture fixture) : IAsyncLifetime
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
    public async Task Create_StoresActiveAliasWithGeneratedAddress()
    {
        var user = await fixture.AUserAsync();
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PostAsJsonAsync(
            "/api/aliases",
            new { label = "  shop  ", purposeMetadata = "{\"site\":\"shop\"}" });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.NotNull(response.Headers.Location);

        var alias = await ReadAliasAsync(response);
        await using var db = fixture.CreateContext();
        var stored = await db.Aliases.SingleAsync(item => item.Id == alias.Id);
        Assert.Equal("shop", stored.Label);
        Assert.Equal(user.Id, stored.UserId);
        Assert.Equal(AliasStatus.Active, stored.Status);
        Assert.Equal("shop", System.Text.Json.JsonDocument.Parse(stored.PurposeMetadata!).RootElement
            .GetProperty("site").GetString());
        Assert.NotNull(stored.FullAddress);
        Assert.Contains($"shop.{stored.RandomSuffix}@postern.local", stored.FullAddress);
        Assert.EndsWith("@postern.local", stored.FullAddress!);
        Assert.StartsWith("shop.", stored.FullAddress!);
        Assert.Equal(4, stored.RandomSuffix!.Length);
    }

    [Fact]
    public async Task Create_StoresProvidedCategory()
    {
        var user = await fixture.AUserAsync();
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PostAsJsonAsync(
            "/api/aliases",
            new { label = "shop", category = "  Shopping  " });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var alias = await ReadAliasAsync(response);
        Assert.Equal("Shopping", alias.Category);

        await using var db = fixture.CreateContext();
        var stored = await db.Aliases.SingleAsync(item => item.Id == alias.Id);
        Assert.Equal("Shopping", stored.Category);
    }

    [Fact]
    public async Task Create_DefaultsCategoryWhenOmitted()
    {
        var user = await fixture.AUserAsync();
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PostAsJsonAsync("/api/aliases", new { label = "shop" });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var alias = await ReadAliasAsync(response);
        Assert.Equal("personal", alias.Category);
    }

    [Fact]
    public async Task Create_TruncatesOverlongCategory()
    {
        var user = await fixture.AUserAsync();
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PostAsJsonAsync(
            "/api/aliases",
            new { label = "shop", category = new string('a', 64) });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var alias = await ReadAliasAsync(response);
        Assert.Equal(40, alias.Category!.Length);
    }

    [Fact]
    public async Task Create_PublishesAliasRecordWithOwnerDestination()
    {
        var user = await fixture.AUserAsync();
        var kv = new RecordingKvWriter();
        using var factory = new PosternApiFactory(fixture, kv);
        using var client = factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PostAsJsonAsync("/api/aliases", new { label = "shop" });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        await using var db = fixture.CreateContext();
        var stored = await db.Aliases.SingleAsync(item => item.Label == "shop" && item.UserId == user.Id);
        var json = kv.Get(stored.FullAddress!.ToLowerInvariant());
        Assert.NotNull(json);
        var record = System.Text.Json.JsonDocument.Parse(json!).RootElement;
        Assert.Equal(user.Email, record.GetProperty("destination").GetString());
        Assert.Equal("active", record.GetProperty("status").GetString());
        Assert.Equal(user.Id.ToString(), record.GetProperty("userId").GetString());
    }

    [Fact]
    public async Task Disable_PublishesDisabledAliasRecord()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        var kv = new RecordingKvWriter();
        using var factory = new PosternApiFactory(fixture, kv);
        using var client = factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PatchAsync($"/api/aliases/{alias.Id}/disable", null);
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        var record = System.Text.Json.JsonDocument.Parse(kv.Get(alias.FullAddress!.ToLowerInvariant())!).RootElement;
        Assert.Equal("disabled", record.GetProperty("status").GetString());
        Assert.Equal(user.Email, record.GetProperty("destination").GetString());
    }

    [Fact]
    public async Task Delete_RemovesAliasRecordFromKv()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        var kv = new RecordingKvWriter();
        kv.PutAsync(alias.FullAddress!.ToLowerInvariant(), "{}", CancellationToken.None).GetAwaiter().GetResult();
        using var factory = new PosternApiFactory(fixture, kv);
        using var client = factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.DeleteAsync($"/api/aliases/{alias.Id}");
        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);

        Assert.Null(kv.Get(alias.FullAddress!.ToLowerInvariant()));
    }

    [Fact]
    public async Task Create_RejectsReservedLabel()
    {
        var user = await fixture.AUserAsync();
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PostAsJsonAsync("/api/aliases", new { label = "postmaster" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ErrorBody>();
        Assert.Equal("reserved_or_invalid_label", body?.Error);
    }

    [Fact]
    public async Task Create_WithBlankLabel_UsesDefaultLabel()
    {
        var user = await fixture.AUserAsync();
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PostAsJsonAsync("/api/aliases", new { label = "   " });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var alias = await ReadAliasAsync(response);
        await using var db = fixture.CreateContext();
        Assert.Equal("default", (await db.Aliases.SingleAsync(item => item.Id == alias.Id)).Label);
    }

    [Fact]
    public async Task Create_TruncatesOverlongLabel()
    {
        var user = await fixture.AUserAsync();
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PostAsJsonAsync(
            "/api/aliases",
            new { label = new string('a', 80) });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        var alias = await ReadAliasAsync(response);
        await using var db = fixture.CreateContext();
        Assert.Equal(64, (await db.Aliases.SingleAsync(item => item.Id == alias.Id)).Label!.Length);
    }

    [Fact]
    public async Task List_ReturnsOnlyCallersAliases()
    {
        var owner = await fixture.AUserAsync();
        var stranger = await fixture.AUserAsync();
        var owned = await fixture.AnAliasAsync(owner.Id, label: "owned");
        var foreign = await fixture.AnAliasAsync(stranger.Id, label: "foreign");

        using var client = _factory.CreateAuthenticatedClient(owner.Id, owner.Email);
        var response = await client.GetAsync("/api/aliases");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var aliases = (await response.Content.ReadFromJsonAsync<List<AliasBody>>())!;
        Assert.Contains(aliases, item => item.Id == owned.Id);
        Assert.DoesNotContain(aliases, item => item.Id == foreign.Id);
    }

    [Fact]
    public async Task Disable_MarksAliasDisabledAndRejectsSecondDisable()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var first = await client.PatchAsync($"/api/aliases/{alias.Id}/disable", null);
        Assert.Equal(HttpStatusCode.NoContent, first.StatusCode);

        await using var db = fixture.CreateContext();
        Assert.Equal(AliasStatus.Disabled, (await db.Aliases.SingleAsync(item => item.Id == alias.Id)).Status);

        var second = await client.PatchAsync($"/api/aliases/{alias.Id}/disable", null);
        Assert.Equal(HttpStatusCode.NotFound, second.StatusCode);
    }

    [Fact]
    public async Task Patch_DeleteActionTombstonesAlias()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PatchAsJsonAsync(
            $"/api/aliases/{alias.Id}",
            new { action = "delete" });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        await using var db = fixture.CreateContext();
        var tombstone = await db.Aliases.SingleAsync(item => item.Id == alias.Id);
        Assert.Equal(AliasStatus.Deleted, tombstone.Status);
        Assert.Equal(alias.FullAddressHash, tombstone.FullAddressHash);
    }

    [Fact]
    public async Task Patch_DisableActionMarksAliasDisabled()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PatchAsJsonAsync(
            $"/api/aliases/{alias.Id}",
            new { action = "disable" });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        await using var db = fixture.CreateContext();
        Assert.Equal(AliasStatus.Disabled, (await db.Aliases.SingleAsync(item => item.Id == alias.Id)).Status);
    }

    [Fact]
    public async Task Patch_UnknownActionReturnsBadRequest()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PatchAsJsonAsync(
            $"/api/aliases/{alias.Id}",
            new { action = "explode" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ErrorBody>();
        Assert.Equal("unknown_action", body?.Error);
    }

    [Fact]
    public async Task Delete_RemovesAliasAndKeepsTombstone()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.DeleteAsync($"/api/aliases/{alias.Id}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        await using var db = fixture.CreateContext();
        var tombstone = await db.Aliases.SingleAsync(item => item.Id == alias.Id);
        Assert.Equal(AliasStatus.Deleted, tombstone.Status);
        Assert.Null(tombstone.FullAddress);
        Assert.NotNull(tombstone.DeletedAt);
    }

    [Fact]
    public async Task ReplaceWithNew_CreatesReplacementAndCopiesExpectedSenders()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        await AddExpectedSenderAsync(alias.Id, "shop.example");
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PostAsJsonAsync(
            $"/api/aliases/{alias.Id}/replace",
            new { label = "replacement" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var replacement = await ReadAliasAsync(response);
        Assert.NotEqual(alias.Id, replacement.Id);

        await using var db = fixture.CreateContext();
        var original = await db.Aliases.SingleAsync(item => item.Id == alias.Id);
        Assert.Equal(AliasStatus.Replaced, original.Status);
        Assert.Equal(replacement.Id, original.ReplacedByAliasId);

        var copied = await db.ExpectedSenders
            .Where(sender => sender.AliasId == replacement.Id)
            .Select(sender => sender.SenderEtld1)
            .ToListAsync();
        Assert.Equal(new[] { "shop.example" }, copied);
    }

    [Fact]
    public async Task ReplaceWithExistingAlias_LinksBothRows()
    {
        var user = await fixture.AUserAsync();
        var original = await fixture.AnAliasAsync(user.Id, label: "original");
        var replacement = await fixture.AnAliasAsync(user.Id, label: "replacement");
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PatchAsync(
            $"/api/aliases/{original.Id}/replace/{replacement.Id}",
            null);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        await using var db = fixture.CreateContext();
        var reloaded = await db.Aliases.SingleAsync(item => item.Id == original.Id);
        Assert.Equal(AliasStatus.Replaced, reloaded.Status);
        Assert.Equal(replacement.Id, reloaded.ReplacedByAliasId);
    }

    [Fact]
    public async Task ReplaceWithExistingAlias_CopiesExpectedSenders()
    {
        var user = await fixture.AUserAsync();
        var original = await fixture.AnAliasAsync(user.Id, label: "original");
        var replacement = await fixture.AnAliasAsync(user.Id, label: "replacement");
        await AddExpectedSenderAsync(original.Id, "shop.example");
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PatchAsync(
            $"/api/aliases/{original.Id}/replace/{replacement.Id}",
            null);

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        await using var db = fixture.CreateContext();
        var copied = await db.ExpectedSenders
            .Where(sender => sender.AliasId == replacement.Id)
            .Select(sender => sender.SenderEtld1)
            .ToListAsync();
        Assert.Equal(new[] { "shop.example" }, copied);
    }

    [Fact]
    public async Task ExpectedSenders_AddListAndMarkExpected()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var add = await client.PostAsJsonAsync(
            $"/api/aliases/{alias.Id}/expected-senders",
            new { senderEtld1 = "Orders.Shop.Example" });
        Assert.Equal(HttpStatusCode.Created, add.StatusCode);

        var listed = await client.GetFromJsonAsync<List<ExpectedSenderBody>>(
            $"/api/aliases/{alias.Id}/expected-senders");
        var sender = Assert.Single(listed!);
        Assert.Equal("shop.example", sender.SenderEtld1);

        var mark = await client.PostAsJsonAsync(
            $"/api/aliases/{alias.Id}/mark-expected",
            new { senderEtld1 = "billing.other.example" });
        Assert.Equal(HttpStatusCode.NoContent, mark.StatusCode);

        var afterMark = await client.GetFromJsonAsync<List<ExpectedSenderBody>>(
            $"/api/aliases/{alias.Id}/expected-senders");
        Assert.Equal(2, afterMark!.Count);
    }

    [Fact]
    public async Task ExpectedSenders_RejectBlankSender()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var add = await client.PostAsJsonAsync(
            $"/api/aliases/{alias.Id}/expected-senders",
            new { senderEtld1 = "" });
        Assert.Equal(HttpStatusCode.BadRequest, add.StatusCode);

        var mark = await client.PostAsJsonAsync(
            $"/api/aliases/{alias.Id}/mark-expected",
            new { senderEtld1 = "" });
        Assert.Equal(HttpStatusCode.BadRequest, mark.StatusCode);
    }

    [Fact]
    public async Task BlockSender_MarksAliasForKvSync()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PostAsJsonAsync(
            $"/api/aliases/{alias.Id}/block-sender",
            new { senderEtld1 = "phish.example" });

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        await using var db = fixture.CreateContext();
        Assert.True((await db.Aliases.SingleAsync(item => item.Id == alias.Id)).KvDirty);
    }

    [Fact]
    public async Task BlockSender_RejectsBlankSender()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);

        var response = await client.PostAsJsonAsync(
            $"/api/aliases/{alias.Id}/block-sender",
            new { senderEtld1 = "   " });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Theory]
    [InlineData("disable")]
    [InlineData("delete")]
    public async Task Mutations_OnForeignAliasReturnNotFound(string operation)
    {
        var owner = await fixture.AUserAsync();
        var stranger = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(owner.Id);
        using var client = _factory.CreateAuthenticatedClient(stranger.Id, stranger.Email);

        var response = operation == "disable"
            ? await client.PatchAsync($"/api/aliases/{alias.Id}/disable", null)
            : await client.DeleteAsync($"/api/aliases/{alias.Id}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        await using var db = fixture.CreateContext();
        Assert.Equal(AliasStatus.Active, (await db.Aliases.SingleAsync(item => item.Id == alias.Id)).Status);
    }

    [Fact]
    public async Task Replace_OnForeignAliasReturnsNotFound()
    {
        var owner = await fixture.AUserAsync();
        var stranger = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(owner.Id);
        using var client = _factory.CreateAuthenticatedClient(stranger.Id, stranger.Email);

        var response = await client.PostAsJsonAsync(
            $"/api/aliases/{alias.Id}/replace",
            new { label = "stolen" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task ExpectedSenders_ForForeignAliasAreNotVisible()
    {
        var owner = await fixture.AUserAsync();
        var stranger = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(owner.Id);
        await AddExpectedSenderAsync(alias.Id, "shop.example");
        using var client = _factory.CreateAuthenticatedClient(stranger.Id, stranger.Email);

        var listed = await client.GetFromJsonAsync<List<ExpectedSenderBody>>(
            $"/api/aliases/{alias.Id}/expected-senders");

        Assert.Empty(listed!);
    }

    private async Task AddExpectedSenderAsync(Guid aliasId, string senderEtld1)
    {
        await using var db = fixture.CreateContext();
        db.ExpectedSenders.Add(new ExpectedSender
        {
            Id = Guid.NewGuid(),
            AliasId = aliasId,
            SenderEtld1 = senderEtld1,
            TrustWholeDomain = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        await db.SaveChangesAsync();
    }

    private static async Task<AliasBody> ReadAliasAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<AliasBody>())!;

    private sealed record AliasBody(
        Guid Id,
        Guid? UserId,
        string? Label,
        string? FullAddress,
        string? PurposeMetadata,
        int Status,
        string? Category);

    private sealed record ExpectedSenderBody(Guid Id, string SenderEtld1, DateTimeOffset CreatedAt);

    private sealed record ErrorBody(string? Error);
}
