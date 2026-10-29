using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Postern.Application.Accounts;
using Postern.Application.Aliases;
using Postern.Application.Integrations;
using Postern.Domain.Accounts;
using Postern.Domain.Aliases;
using Postern.Infrastructure.Accounts;
using Postern.Infrastructure.Aliases;
using Postern.Infrastructure.Integrations;
using Postern.Infrastructure.Persistence;

namespace Postern.IntegrationTests;

public class DatabaseIntegrationTests
{
    private const string ConnectionString = "Host=localhost;Port=5432;Database=postern;Username=postern_app;Password=unused;Search Path=postern";

    [Fact]
    public async Task EfAccountRepository_CrudOperations()
    {
        using var factory = CreateFactory();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PosternDbContext>();
        
        var repo = new EfAccountRepository(db);
        var userId = Guid.NewGuid();
        var user = new PosternUser
        {
            Id = userId,
            Email = $"test{userId:N}@example.com",
            NormalizedEmail = $"TEST{userId:N}@EXAMPLE.COM",
            PasswordHash = "hash",
            Status = "active",
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var found = await repo.FindByIdAsync(userId, CancellationToken.None);
        Assert.NotNull(found);

        var updated = await repo.UpdateForwardingAddressAsync(userId, "new@example.com", CancellationToken.None);
        Assert.True(updated);

        db.ChangeTracker.Clear();
        var updatedUser = await db.Users.FindAsync(userId);
        Assert.Equal("new@example.com", updatedUser!.Email);
    }

    [Fact]
    public async Task EfAliasRepository_TombstonePreservesHash()
    {
        using var factory = CreateFactory();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PosternDbContext>();
        
        var userId = Guid.NewGuid();
        var user = new PosternUser
        {
            Id = userId,
            Email = $"test{userId:N}@example.com",
            NormalizedEmail = $"TEST{userId:N}@EXAMPLE.COM",
            PasswordHash = "hash",
            Status = "active",
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var repo = new EfAliasRepository(db);
        var alias = new Alias
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Label = "test",
            RandomSuffix = "abcd1234",
            FullAddress = $"test-abcd1234-{userId:N}@postern.local",
            FullAddressHash = AliasService.HashAddress($"test-abcd1234-{userId:N}@postern.local"),
            PurposeMetadata = null,
            Category = "personal",
            Status = AliasStatus.Active,
            CreatedAt = DateTimeOffset.UtcNow,
            KvDirty = false
        };
        await repo.CreateAsync(alias, CancellationToken.None);

        var deleted = await repo.DeleteAsync(alias.Id, userId, DateTimeOffset.UtcNow, CancellationToken.None);
        Assert.True(deleted);

        db.ChangeTracker.Clear();
        var tombstoned = await db.Aliases.FindAsync(alias.Id);
        Assert.NotNull(tombstoned);
        Assert.Equal(AliasStatus.Deleted, tombstoned.Status);
        Assert.Null(tombstoned.UserId);
        Assert.Null(tombstoned.FullAddress);
        Assert.Equal(alias.FullAddressHash, tombstoned.FullAddressHash);
    }

    [Fact]
    public async Task EfAccountRepository_DeleteAccountCleansUp()
    {
        using var factory = CreateFactory();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PosternDbContext>();
        
        var userId = Guid.NewGuid();
        var user = new PosternUser
        {
            Id = userId,
            Email = $"test{userId:N}@example.com",
            NormalizedEmail = $"TEST{userId:N}@EXAMPLE.COM",
            PasswordHash = "hash",
            Status = "active",
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var alias = new Alias
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Label = "test",
            RandomSuffix = "abcd1234",
            FullAddress = $"test-abcd1234-{userId:N}@postern.local",
            FullAddressHash = AliasService.HashAddress($"test-abcd1234-{userId:N}@postern.local"),
            PurposeMetadata = null,
            Category = "personal",
            Status = AliasStatus.Active,
            CreatedAt = DateTimeOffset.UtcNow,
            KvDirty = false
        };
        db.Aliases.Add(alias);
        await db.SaveChangesAsync();

        var repo = new EfAccountRepository(db);
        var result = await repo.DeleteAccountAsync(userId, DateTimeOffset.UtcNow, CancellationToken.None);
        Assert.True(result);

        db.ChangeTracker.Clear();
        var deletedUser = await db.Users.FindAsync(userId);
        Assert.Null(deletedUser);
        
        var tombstonedAlias = await db.Aliases.FindAsync(alias.Id);
        Assert.NotNull(tombstonedAlias);
        Assert.Equal(AliasStatus.Deleted, tombstonedAlias.Status);
        Assert.Null(tombstonedAlias.UserId);
    }

    private static WebApplicationFactory<Program> CreateFactory() =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.UseSetting("Authentication:SigningKey", "integration-test-key-material-at-least-thirty-two-bytes");
            builder.UseSetting("ConnectionStrings:Postgres", ConnectionString);
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<PosternDbContext>();
                services.AddDbContext<PosternDbContext>(options =>
                    PosternDbContext.ConfigureNpgsql(options, ConnectionString));
                services.RemoveAll<IKvWriter>();
                services.AddSingleton<IKvWriter>(new Postern.Infrastructure.Integrations.NoOpKvWriter());
                services.RemoveAll<IDestinationService>();
                services.AddSingleton<IDestinationService>(new Postern.Infrastructure.Integrations.DevelopmentDestinationService());
            });
        });
}
