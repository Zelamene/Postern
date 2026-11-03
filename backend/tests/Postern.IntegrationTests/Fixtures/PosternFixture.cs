using Microsoft.EntityFrameworkCore;
using Postern.Application.Aliases;
using Postern.Domain.Accounts;
using Postern.Domain.Activity;
using Postern.Domain.Aliases;
using Postern.Infrastructure.Persistence;
using Testcontainers.PostgreSql;

namespace Postern.IntegrationTests.Fixtures;

public sealed class PosternFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _container = new PostgreSqlBuilder()
        .WithImage("postgres:18")
        .Build();

    public string ConnectionString { get; private set; } = string.Empty;

    public PosternDbContext CreateContext() =>
        new(
            new DbContextOptionsBuilder<PosternDbContext>()
                .UseNpgsql(
                    ConnectionString,
                    postgres => postgres.MigrationsHistoryTable("__EFMigrationsHistory", "postern"))
                .Options);

    public async Task InitializeAsync()
    {
        await _container.StartAsync();
        ConnectionString = _container.GetConnectionString();

        await using var db = CreateContext();
        await db.Database.EnsureCreatedAsync();
    }

    public Task DisposeAsync() => _container.DisposeAsync().AsTask();

    public async Task<PosternUser> AUserAsync(
        string? email = null,
        string status = "active",
        bool isAdmin = false)
    {
        await using var db = CreateContext();
        var user = new PosternUser
        {
            Id = Guid.NewGuid(),
            Email = email ?? $"user-{Guid.NewGuid():N}@example.test",
            NormalizedEmail = (email ?? $"user-{Guid.NewGuid():N}@example.test").ToUpperInvariant(),
            PasswordHash = "hash",
            IsAdmin = isAdmin,
            Status = status,
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();
        return user;
    }

    public async Task<Alias> AnAliasAsync(
        Guid userId,
        string label = "shop",
        AliasStatus status = AliasStatus.Active,
        string? category = "personal")
    {
        await using var db = CreateContext();
        var address = $"{label}-{Guid.NewGuid():N}@postern.test";
        var alias = new Alias
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Label = label,
            RandomSuffix = Guid.NewGuid().ToString("N")[..8],
            FullAddress = address,
            FullAddressHash = AliasService.HashAddress(address),
            Category = category,
            Status = status,
            CreatedAt = DateTimeOffset.UtcNow,
            DeletedAt = status == AliasStatus.Deleted ? DateTimeOffset.UtcNow : null,
            KvDirty = false
        };
        db.Aliases.Add(alias);
        await db.SaveChangesAsync();
        return alias;
    }

    public async Task<Message> AMessageAsync(
        Guid aliasId,
        DateTimeOffset? receivedAt = null,
        string subject = "your order shipped",
        bool isFlagged = false,
        string? flagReason = null)
    {
        await using var db = CreateContext();
        var message = new Message
        {
            Id = Guid.NewGuid(),
            AliasId = aliasId,
            FromHeader = "Shop <orders@shop.example>",
            EnvelopeSender = "orders@shop.example",
            Subject = subject,
            ReceivedAt = receivedAt ?? DateTimeOffset.UtcNow,
            AuthenticationResult = "pass",
            IsFlagged = isFlagged,
            FlagReason = flagReason
        };
        db.Messages.Add(message);
        await db.SaveChangesAsync();
        return message;
    }

    public async Task<BlockedMessage> ABlockedMessageAsync(
        Guid aliasId,
        DateTimeOffset? receivedAt = null,
        string reason = "unexpected_sender",
        string subject = "verify your account")
    {
        await using var db = CreateContext();
        var message = new BlockedMessage
        {
            Id = Guid.NewGuid(),
            AliasId = aliasId,
            FromHeader = "Phish <security@phish.example>",
            Subject = subject,
            ReceivedAt = receivedAt ?? DateTimeOffset.UtcNow,
            Reason = reason
        };
        db.BlockedMessages.Add(message);
        await db.SaveChangesAsync();
        return message;
    }
}
