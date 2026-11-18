using System.Text.Json;
using Postern.Application.Accounts;
using Postern.Domain.Accounts;
using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public class SuspendedUserServiceTests
{
    [Fact]
    public async Task Rebuild_PublishesEverySuspendedUserId()
    {
        var suspended = AUser("suspended");
        var active = AUser("active");
        var accounts = new InMemoryAccountRepository();
        accounts.Add(suspended);
        accounts.Add(active);
        var kvWriter = new InMemoryKvWriter();
        var service = new SuspendedUserService(accounts, kvWriter);

        await service.RebuildAsync(CancellationToken.None);

        var users = ReadUsers(kvWriter);
        Assert.Equal(JsonValueKind.True, users.GetProperty(suspended.Id.ToString()).ValueKind);
        Assert.False(users.TryGetProperty(active.Id.ToString(), out _));
    }

    [Fact]
    public async Task Rebuild_WithNoSuspendedUsers_PublishesEmptyMap()
    {
        var accounts = new InMemoryAccountRepository();
        accounts.Add(AUser("active"));
        var kvWriter = new InMemoryKvWriter();
        var service = new SuspendedUserService(accounts, kvWriter);

        await service.RebuildAsync(CancellationToken.None);

        Assert.Equal(0, ReadUsers(kvWriter).GetPropertyCount());
    }

    [Fact]
    public async Task Rebuild_OverwritesThePreviousMap()
    {
        var kvWriter = new InMemoryKvWriter();
        await kvWriter.PutAsync(SuspendedUserService.KvKey, "{\"users\":{\"stale\":true}}", CancellationToken.None);
        var service = new SuspendedUserService(new InMemoryAccountRepository(), kvWriter);

        await service.RebuildAsync(CancellationToken.None);

        Assert.Equal(0, ReadUsers(kvWriter).GetPropertyCount());
    }

    [Fact]
    public async Task Rebuild_EmitsTheFieldsDeclaredByTheSharedContract()
    {
        var declaration = SharedContractFixture.Load("kv-records.json")
            .GetProperty("maps")
            .GetProperty(SuspendedUserService.KvKey);
        var userIds = declaration.GetProperty("example")
            .GetProperty("users")
            .EnumerateObject()
            .Select(property => Guid.Parse(property.Name))
            .ToArray();
        var accounts = new InMemoryAccountRepository();
        foreach (var id in userIds)
        {
            accounts.Add(AUser("suspended", id));
        }
        var kvWriter = new InMemoryKvWriter();

        await new SuspendedUserService(accounts, kvWriter).RebuildAsync(CancellationToken.None);

        var payload = JsonDocument.Parse(kvWriter.Values[SuspendedUserService.KvKey]).RootElement;
        SharedContractFixture.AssertEmitsDeclaredFields(payload, declaration, SuspendedUserService.KvKey);
        var users = payload.GetProperty("users");
        Assert.Equal(userIds.Length, users.GetPropertyCount());
        Assert.All(userIds, id =>
            Assert.Equal(JsonValueKind.True, users.GetProperty(id.ToString()).ValueKind));
    }

    private static JsonElement ReadUsers(InMemoryKvWriter kvWriter)
    {
        var json = kvWriter.Values[SuspendedUserService.KvKey];
        return JsonDocument.Parse(json).RootElement.GetProperty("users");
    }

    private static PosternUser AUser(string status, Guid? id = null) => new()
    {
        Id = id ?? Guid.NewGuid(),
        Email = $"{status}-{Guid.NewGuid():N}@example.test",
        NormalizedEmail = $"{status}-{Guid.NewGuid():N}@EXAMPLE.TEST".ToUpperInvariant(),
        PasswordHash = "hash",
        Status = status,
        CreatedAt = DateTimeOffset.UtcNow
    };
}
