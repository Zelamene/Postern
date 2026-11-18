using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Postern.Application.Accounts;
using Postern.Application.Activity;
using Postern.Application.Administration;
using Postern.Domain.Administration;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Flows;

/// <summary>
/// QR5.2: an empty KV namespace must be rebuildable from the database alone, and a
/// full sync must delete keys that no longer correspond to anything. The rate-limit
/// projection skips writes when its process-wide cache matches the computed set, so
/// these tests use freshly created users (guaranteeing a set difference) and assert
/// the KV end state rather than "a put happened".
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class ProjectionRebuildTests(PosternFixture fixture) : IAsyncLifetime
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
    public async Task FullSync_RebuildsEveryProjectionFromAnEmptyNamespaceAndDeletesOrphans()
    {
        var kv = new RecordingKvWriter();
        using var factory = new PosternApiFactory(fixture, kv);

        var owner = await fixture.AUserAsync();
        var activeAlias = await fixture.AnAliasAsync(owner.Id, label: "rebuild-active");
        var disabledAlias = await fixture.AnAliasAsync(
            owner.Id,
            label: "rebuild-disabled",
            status: Postern.Domain.Aliases.AliasStatus.Disabled);
        var suspended = await fixture.AUserAsync(status: "suspended");
        var heavy = await fixture.AUserAsync();
        var heavyAlias = await fixture.AnAliasAsync(heavy.Id, label: "rebuild-heavy");

        await SeedAsync(db =>
        {
            db.GlobalBlocklist.Add(new GlobalBlockedDomain
            {
                DomainEtld1 = "rebuild-spam.example",
                Reason = "queued by the rebuild test",
                CreatedAt = DateTimeOffset.UtcNow
            });
            db.Messages.AddRange(Enumerable.Range(0, RateLimitService.DailyForwardingLimit + 1)
                .Select(index => new Postern.Domain.Activity.Message
                {
                    Id = Guid.NewGuid(),
                    AliasId = heavyAlias.Id,
                    FromHeader = "Shop <orders@shop.example>",
                    EnvelopeSender = "orders@shop.example",
                    Subject = $"seeded {index}",
                    ReceivedAt = DateTimeOffset.UtcNow.AddMinutes(-index),
                    AuthenticationResult = "pass"
                }));
            return Task.CompletedTask;
        });

        // Residue from earlier state: a stale alias key and an unrelated key.
        await kv.PutAsync("orphan@postern.test", "{\"status\":\"active\"}", CancellationToken.None);
        await kv.PutAsync("unrelated-key", "value", CancellationToken.None);

        using (var scope = factory.Services.CreateScope())
        {
            var sync = scope.ServiceProvider.GetRequiredService<AdminKvSyncService>();
            await sync.SyncAsync(null, CancellationToken.None, fullSync: true);

            var rateLimits = scope.ServiceProvider.GetRequiredService<RateLimitService>();
            await rateLimits.RebuildRateLimitedUsersAsync(CancellationToken.None);
        }

        var activeKey = activeAlias.FullAddress!.ToLowerInvariant();
        var disabledKey = disabledAlias.FullAddress!.ToLowerInvariant();
        Assert.NotNull(kv.Get(activeKey));
        Assert.NotNull(kv.Get(disabledKey));

        var activeRecord = JsonDocument.Parse(kv.Get(activeKey)!).RootElement;
        Assert.Equal("active", activeRecord.GetProperty("status").GetString());
        Assert.Equal(owner.Id.ToString(), activeRecord.GetProperty("userId").GetString());
        Assert.Equal(owner.Email, activeRecord.GetProperty("destination").GetString());

        var disabledRecord = JsonDocument.Parse(kv.Get(disabledKey)!).RootElement;
        Assert.Equal("disabled", disabledRecord.GetProperty("status").GetString());

        Assert.Null(kv.Get("orphan@postern.test"));
        Assert.Null(kv.Get("unrelated-key"));

        var blocklist = JsonDocument.Parse(kv.Get(GlobalBlocklistService.KvKey)!).RootElement;
        Assert.Contains(
            "rebuild-spam.example",
            blocklist.GetProperty("domains").EnumerateArray().Select(domain => domain.GetString()));

        var suspendedUsers = JsonDocument.Parse(kv.Get(SuspendedUserService.KvKey)!).RootElement;
        Assert.True(suspendedUsers.GetProperty("users").TryGetProperty(suspended.Id.ToString(), out var flag));
        Assert.True(flag.GetBoolean());

        var rateLimited = JsonDocument.Parse(kv.Get(RateLimitService.KvKey)!).RootElement;
        Assert.True(rateLimited.GetProperty("users").TryGetProperty(heavy.Id.ToString(), out var until));
        Assert.True(until.GetInt64() > DateTimeOffset.UtcNow.ToUnixTimeSeconds());
    }

    [Fact]
    public async Task SecondFullSync_WritesNoAliasOrRateLimitChanges()
    {
        var kv = new RecordingKvWriter();
        using var factory = new PosternApiFactory(fixture, kv);

        var owner = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(owner.Id, label: "rebuild-idempotent");
        var heavy = await fixture.AUserAsync();
        var heavyAlias = await fixture.AnAliasAsync(heavy.Id, label: "rebuild-idempotent-heavy");

        await SeedAsync(db =>
        {
            db.Messages.AddRange(Enumerable.Range(0, RateLimitService.DailyForwardingLimit + 1)
                .Select(index => new Postern.Domain.Activity.Message
                {
                    Id = Guid.NewGuid(),
                    AliasId = heavyAlias.Id,
                    FromHeader = "Shop <orders@shop.example>",
                    EnvelopeSender = "orders@shop.example",
                    Subject = $"seeded {index}",
                    ReceivedAt = DateTimeOffset.UtcNow.AddMinutes(-index),
                    AuthenticationResult = "pass"
                }));
            return Task.CompletedTask;
        });

        using var scope = factory.Services.CreateScope();
        var sync = scope.ServiceProvider.GetRequiredService<AdminKvSyncService>();
        var rateLimits = scope.ServiceProvider.GetRequiredService<RateLimitService>();

        await sync.SyncAsync(null, CancellationToken.None, fullSync: true);
        await rateLimits.RebuildRateLimitedUsersAsync(CancellationToken.None);

        // Alias keys converge: the payload is compared before writing, so a second
        // full sync must not rewrite them.
        var aliasKey = alias.FullAddress!.ToLowerInvariant();
        var putsBeforeSecondSync = kv.PutsFor(aliasKey);
        var suspendedPutsBefore = kv.PutsFor(SuspendedUserService.KvKey);

        await sync.SyncAsync(null, CancellationToken.None, fullSync: true);

        Assert.Equal(putsBeforeSecondSync, kv.PutsFor(aliasKey));
        // The suspended map has no compare-before-write step, so a sync rewrites it.
        // That is current behaviour, recorded here rather than hidden by a total count.
        Assert.Equal(suspendedPutsBefore + 1, kv.PutsFor(SuspendedUserService.KvKey));

        var rateLimitPutsBefore = kv.PutsFor(RateLimitService.KvKey);
        await rateLimits.RebuildRateLimitedUsersAsync(CancellationToken.None);
        Assert.Equal(rateLimitPutsBefore, kv.PutsFor(RateLimitService.KvKey));
    }

    private async Task SeedAsync(Func<Postern.Infrastructure.Persistence.PosternDbContext, Task> seed)
    {
        await using var db = fixture.CreateContext();
        await seed(db);
        await db.SaveChangesAsync();
    }
}
