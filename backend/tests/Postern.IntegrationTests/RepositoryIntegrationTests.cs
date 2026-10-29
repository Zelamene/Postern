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

public class RepositoryIntegrationTests
{
    private const string ConnectionString = "Host=localhost;Port=5432;Database=postern;Username=postern_app;Password=unused;Search Path=postern"; // pragma: allowlist secret

    [Fact]
    public async Task EfAliasRepository_UpdateStatus_DisableEnable()
    {
        using var factory = CreateFactory();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PosternDbContext>();
        
        var userId = Guid.NewGuid();
        var user = new PosternUser
        {
            Id = userId,
            Email = $"t{userId:N}@example.com",
            NormalizedEmail = $"T{userId:N}@EXAMPLE.COM",
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

        var disabled = await repo.UpdateStatusAsync(alias.Id, userId, AliasStatus.Disabled, DateTimeOffset.UtcNow, CancellationToken.None);
        Assert.True(disabled);
        
        db.ChangeTracker.Clear();
        var reloaded = await db.Aliases.FindAsync(alias.Id);
        Assert.Equal(AliasStatus.Disabled, reloaded!.Status);
    }

    [Fact]
    public async Task EfAliasRepository_MarkReplaced()
    {
        using var factory = CreateFactory();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PosternDbContext>();
        
        var userId = Guid.NewGuid();
        var user = new PosternUser
        {
            Id = userId,
            Email = $"t{userId:N}@example.com",
            NormalizedEmail = $"T{userId:N}@EXAMPLE.COM",
            PasswordHash = "hash",
            Status = "active",
            CreatedAt = DateTimeOffset.UtcNow
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var repo = new EfAliasRepository(db);
        var orig = new Alias
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Label = "orig",
            RandomSuffix = "abcd1234",
            FullAddress = $"orig-abcd1234-{userId:N}@postern.local",
            FullAddressHash = AliasService.HashAddress($"orig-abcd1234-{userId:N}@postern.local"),
            PurposeMetadata = null,
            Category = "personal",
            Status = AliasStatus.Active,
            CreatedAt = DateTimeOffset.UtcNow,
            KvDirty = false
        };
        var repl = new Alias
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Label = "repl",
            RandomSuffix = "efgh5678",
            FullAddress = $"repl-efgh5678-{userId:N}@postern.local",
            FullAddressHash = AliasService.HashAddress($"repl-efgh5678-{userId:N}@postern.local"),
            PurposeMetadata = null,
            Category = "personal",
            Status = AliasStatus.Active,
            CreatedAt = DateTimeOffset.UtcNow,
            KvDirty = false
        };
        await repo.CreateAsync(orig, CancellationToken.None);
        await repo.CreateAsync(repl, CancellationToken.None);

        var replaced = await repo.MarkReplacedAsync(orig.Id, userId, repl.Id, DateTimeOffset.UtcNow, CancellationToken.None);
        Assert.True(replaced);
        
        db.ChangeTracker.Clear();
        var reloaded = await db.Aliases.FindAsync(orig.Id);
        Assert.Equal(AliasStatus.Replaced, reloaded!.Status);
        Assert.Equal(repl.Id, reloaded.ReplacedByAliasId);
    }

    [Fact]
    public async Task EfAliasRepository_ListByUser()
    {
        using var factory = CreateFactory();
        using var scope = factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<PosternDbContext>();
        
        var userId = Guid.NewGuid();
        var user = new PosternUser
        {
            Id = userId,
            Email = $"t{userId:N}@example.com",
            NormalizedEmail = $"T{userId:N}@EXAMPLE.COM",
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

        var list = await repo.ListByUserAsync(userId, CancellationToken.None);
        Assert.Contains(list, a => a.Id == alias.Id);
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
                services.AddSingleton<IKvWriter>(new NoOpKvWriter());
                services.RemoveAll<IDestinationService>();
                services.AddSingleton<IDestinationService>(new DevelopmentDestinationService());
            });
        });
}
