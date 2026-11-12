using Postern.Application.Accounts;
using Postern.Application.Aliases;
using Postern.Application.Integrations;
using Postern.Domain.Accounts;
using Postern.Domain.Aliases;
using Postern.Domain.Activity;
using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public class AccountManagementTests
{
    [Fact]
    public async Task ChangeForwardingAddress_SwitchesAfterVerification_AndRemovesOldDestination()
    {
        var userId = Guid.NewGuid();
        var user = new PosternUser
        {
            Id = userId,
            Email = "old@example.com",
            NormalizedEmail = "OLD@EXAMPLE.COM",
            PasswordHash = "hash",
            Status = "active"
        };

        var accounts = new InMemoryAccountRepository(user);
        var destinations = new InMemoryDestinationService();
        var kvWriter = new InMemoryKvWriter();
        var service = new AccountManagementService(
            accounts,
            new InMemoryAliasRepository(),
            destinations,
            kvWriter,
            new FixedTimeProvider(DateTimeOffset.UtcNow));

        var result = await service.ChangeForwardingAddressAsync(userId, "new@example.com", CancellationToken.None);

        Assert.Equal(ForwardingChangeResult.Success, result);
        Assert.Equal(["old@example.com"], destinations.Removed);
        Assert.Equal(["new@example.com"], destinations.Destinations);
        Assert.Equal("new@example.com", user.ForwardingAddress);
        Assert.Equal("new@example.com", user.EffectiveForwardingAddress);

        Assert.Equal("old@example.com", user.Email);
        Assert.Equal("OLD@EXAMPLE.COM", user.NormalizedEmail);
        Assert.NotNull(await accounts.FindByNormalizedEmailAsync("OLD@EXAMPLE.COM", CancellationToken.None));
    }

    [Fact]
    public async Task ChangeForwardingAddress_UnverifiedDestination_LeavesTheAccountUntouched()
    {
        var userId = Guid.NewGuid();
        var user = new PosternUser
        {
            Id = userId,
            Email = "login@example.com",
            NormalizedEmail = "LOGIN@EXAMPLE.COM",
            ForwardingAddress = "first@example.com",
            PasswordHash = "hash",
            Status = "active"
        };

        var accounts = new InMemoryAccountRepository(user);
        var destinations = new InMemoryDestinationService { AutoVerify = false };
        var service = new AccountManagementService(
            accounts,
            new InMemoryAliasRepository(),
            destinations,
            new InMemoryKvWriter(),
            new FixedTimeProvider(DateTimeOffset.UtcNow));

        var result = await service.ChangeForwardingAddressAsync(userId, "second@example.com", CancellationToken.None);

        Assert.Equal(ForwardingChangeResult.VerificationRequired, result);
        Assert.Equal("first@example.com", user.ForwardingAddress);
        Assert.Empty(destinations.Removed);
        Assert.Equal(["second@example.com"], destinations.Destinations);
    }

    [Fact]
    public async Task ChangeForwardingAddress_KeepsADestinationAnotherUserShares()
    {
        var userId = Guid.NewGuid();
        var sharedAddress = "shared@example.com";
        var user = new PosternUser
        {
            Id = userId,
            Email = "login@example.com",
            NormalizedEmail = "LOGIN@EXAMPLE.COM",
            ForwardingAddress = sharedAddress,
            PasswordHash = "hash",
            Status = "active"
        };
        var accounts = new InMemoryAccountRepository(user);
        accounts.Add(new PosternUser
        {
            Id = Guid.NewGuid(),
            Email = "other@example.com",
            NormalizedEmail = "OTHER@EXAMPLE.COM",
            ForwardingAddress = sharedAddress,
            PasswordHash = "hash",
            Status = "active"
        });
        var destinations = new InMemoryDestinationService();
        var service = new AccountManagementService(
            accounts,
            new InMemoryAliasRepository(),
            destinations,
            new InMemoryKvWriter(),
            new FixedTimeProvider(DateTimeOffset.UtcNow));

        var result = await service.ChangeForwardingAddressAsync(userId, "second@example.com", CancellationToken.None);

        Assert.Equal(ForwardingChangeResult.Success, result);
        Assert.Empty(destinations.Removed);
        Assert.Equal("second@example.com", user.ForwardingAddress);
    }

    [Fact]
    public async Task ChangeForwardingAddress_SameAddress_DoesNothing()
    {
        var userId = Guid.NewGuid();
        var user = new PosternUser
        {
            Id = userId,
            Email = "login@example.com",
            NormalizedEmail = "LOGIN@EXAMPLE.COM",
            ForwardingAddress = "same@example.com",
            PasswordHash = "hash",
            Status = "active"
        };
        var destinations = new InMemoryDestinationService();
        var service = new AccountManagementService(
            new InMemoryAccountRepository(user),
            new InMemoryAliasRepository(),
            destinations,
            new InMemoryKvWriter(),
            new FixedTimeProvider(DateTimeOffset.UtcNow));

        var result = await service.ChangeForwardingAddressAsync(userId, "SAME@example.com", CancellationToken.None);

        Assert.Equal(ForwardingChangeResult.Success, result);
        Assert.Empty(destinations.Destinations);
        Assert.Empty(destinations.Removed);
    }

    [Fact]
    public async Task ChangeForwardingAddress_InvalidAddress_ReturnsInvalid()
    {
        var userId = Guid.NewGuid();
        var user = new PosternUser
        {
            Id = userId,
            Email = "old@example.com",
            NormalizedEmail = "OLD@EXAMPLE.COM",
            PasswordHash = "hash",
            Status = "active"
        };
        var service = new AccountManagementService(
            new InMemoryAccountRepository(user),
            new InMemoryAliasRepository(),
            new InMemoryDestinationService(),
            new InMemoryKvWriter(),
            new FixedTimeProvider(DateTimeOffset.UtcNow));

        var result = await service.ChangeForwardingAddressAsync(userId, "   ", CancellationToken.None);

        Assert.Equal(ForwardingChangeResult.Invalid, result);
    }

    [Fact]
    public async Task ChangeForwardingAddress_UserMissing_ReturnsNotFound()
    {
        var service = new AccountManagementService(
            new InMemoryAccountRepository(new PosternUser
            {
                Id = Guid.NewGuid(),
                Email = "x@e.com",
                NormalizedEmail = "X@E.COM",
                PasswordHash = "h",
                Status = "active"
            }),
            new InMemoryAliasRepository(),
            new InMemoryDestinationService(),
            new InMemoryKvWriter(),
            new FixedTimeProvider(DateTimeOffset.UtcNow));

        var result = await service.ChangeForwardingAddressAsync(Guid.NewGuid(), "new@example.com", CancellationToken.None);

        Assert.Equal(ForwardingChangeResult.NotFound, result);
    }

    [Fact]
    public async Task ChangeForwardingAddress_WhenAddDestinationFails_ReturnsInvalid()
    {
        var userId = Guid.NewGuid();
        var user = new PosternUser
        {
            Id = userId,
            Email = "old@example.com",
            NormalizedEmail = "OLD@EXAMPLE.COM",
            PasswordHash = "hash",
            Status = "active"
        };
        var service = new AccountManagementService(
            new InMemoryAccountRepository(user),
            new InMemoryAliasRepository(),
            new InMemoryDestinationService { ShouldFail = true },
            new InMemoryKvWriter(),
            new FixedTimeProvider(DateTimeOffset.UtcNow));

        var result = await service.ChangeForwardingAddressAsync(userId, "new@example.com", CancellationToken.None);

        Assert.Equal(ForwardingChangeResult.Invalid, result);
    }

    [Fact]
    public async Task ChangeForwardingAddress_RepublishesAliasesWithBlockedSenders_AndMarksDirtyOnKvFailure()
    {
        var userId = Guid.NewGuid();
        var user = new PosternUser
        {
            Id = userId,
            Email = "old@example.com",
            NormalizedEmail = "OLD@EXAMPLE.COM",
            PasswordHash = "hash",
            Status = "active"
        };
        var alias = new Alias
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Label = "l",
            RandomSuffix = "s",
            FullAddress = "l-s@postern.local",
            FullAddressHash = "h",
            Status = AliasStatus.Active,
            CreatedAt = DateTimeOffset.UtcNow,
            KvDirty = false
        };
        var aliases = new InMemoryAliasRepository();
        aliases.Seed(alias);
        aliases.SeedExpectedSender(new ExpectedSender
        {
            Id = Guid.NewGuid(),
            AliasId = alias.Id,
            SenderEtld1 = "spam.example",
            IsBlocked = true,
            CreatedAt = DateTimeOffset.UtcNow
        });
        var kvWriter = new InMemoryKvWriter();
        var service = new AccountManagementService(
            new InMemoryAccountRepository(user),
            aliases,
            new InMemoryDestinationService(),
            kvWriter,
            new FixedTimeProvider(DateTimeOffset.UtcNow));

        var result = await service.ChangeForwardingAddressAsync(userId, "new@example.com", CancellationToken.None);

        Assert.Equal(ForwardingChangeResult.Success, result);
        var payload = System.Text.Json.JsonDocument.Parse(kvWriter.Values["l-s@postern.local"]).RootElement;
        Assert.Equal("new@example.com", payload.GetProperty("destination").GetString());
        Assert.Equal(
            new[] { "spam.example" },
            payload.GetProperty("blockedSenders").EnumerateArray().Select(item => item.GetString()));

        var failing = new AccountManagementService(
            new InMemoryAccountRepository(user),
            aliases,
            new InMemoryDestinationService(),
            new InMemoryKvWriter { ShouldFail = true },
            new FixedTimeProvider(DateTimeOffset.UtcNow));
        var secondUser = new PosternUser
        {
            Id = Guid.NewGuid(),
            Email = "second@example.com",
            NormalizedEmail = "SECOND@EXAMPLE.COM",
            PasswordHash = "hash",
            Status = "active"
        };
        var failingAliases = new InMemoryAliasRepository();
        failingAliases.Seed(new Alias
        {
            Id = Guid.NewGuid(),
            UserId = secondUser.Id,
            Label = "l",
            RandomSuffix = "s",
            FullAddress = "second-s@postern.local",
            FullAddressHash = "h2",
            Status = AliasStatus.Active,
            CreatedAt = DateTimeOffset.UtcNow
        });
        var failingService = new AccountManagementService(
            new InMemoryAccountRepository(secondUser),
            failingAliases,
            new InMemoryDestinationService(),
            new InMemoryKvWriter { ShouldFail = true },
            new FixedTimeProvider(DateTimeOffset.UtcNow));

        Assert.Equal(
            ForwardingChangeResult.Success,
            await failingService.ChangeForwardingAddressAsync(secondUser.Id, "newer@example.com", CancellationToken.None));
        Assert.NotEmpty(failingAliases.KvDirtyAliasIds);
        _ = failing;
    }

    [Fact]
    public async Task DeleteAccount_DeletesKvEntries_TombstonesAliases_RemovesData_DeletesUser()
    {
        var userId = Guid.NewGuid();
        var aliasId = Guid.NewGuid();
        var alias = new Alias
        {
            Id = aliasId,
            UserId = userId,
            Label = "test",
            RandomSuffix = "abcd1234",
            FullAddress = "test-abcd1234@postern.local",
            FullAddressHash = AliasService.HashAddress("test-abcd1234@postern.local"),
            PurposeMetadata = "p",
            Category = "personal",
            Status = AliasStatus.Active,
            CreatedAt = DateTimeOffset.UtcNow
        };

        var user = new PosternUser
        {
            Id = userId,
            Email = "user@example.com",
            NormalizedEmail = "USER@EXAMPLE.COM",
            PasswordHash = "hash",
            Status = "active"
        };
        user.Aliases.Add(alias);

        var accounts = new InMemoryAccountRepository(user);
        var destinations = new InMemoryDestinationService();
        var kvWriter = new InMemoryKvWriter();
        await kvWriter.PutAsync("test-abcd1234@postern.local", "{}", CancellationToken.None);
        var timeProvider = new FixedTimeProvider(new DateTimeOffset(2026, 10, 28, 13, 0, 0, TimeSpan.Zero));
        var service = new AccountManagementService(
            accounts,
            new InMemoryAliasRepository(),
            destinations,
            kvWriter,
            timeProvider);

        var result = await service.DeleteAccountAsync(userId, CancellationToken.None);
        Assert.True(result);

        Assert.DoesNotContain("test-abcd1234@postern.local", kvWriter.Values.Keys);
        Assert.Contains("user@example.com", destinations.Removed);

        var tombstoned = user.Aliases.FirstOrDefault(a => a.Id == aliasId);
        Assert.NotNull(tombstoned);
        Assert.Equal(AliasStatus.Deleted, tombstoned.Status);
        Assert.Null(tombstoned.UserId);
        Assert.Null(tombstoned.Label);
        Assert.Null(tombstoned.FullAddress);
        Assert.Equal(alias.FullAddressHash, tombstoned.FullAddressHash);
        Assert.NotNull(tombstoned.DeletedAt);

        Assert.Null(accounts.FindUserById(userId));
    }

    [Fact]
    public async Task DeleteAccount_BestEffort_WhenKvAndDestinationFail_StillDeletesAccount()
    {
        var userId = Guid.NewGuid();
        var alias = new Alias
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Label = "test",
            RandomSuffix = "abcd1234",
            FullAddress = "test-abcd1234@postern.local",
            FullAddressHash = AliasService.HashAddress("test-abcd1234@postern.local"),
            PurposeMetadata = "p",
            Category = "personal",
            Status = AliasStatus.Active,
            CreatedAt = DateTimeOffset.UtcNow
        };

        var user = new PosternUser
        {
            Id = userId,
            Email = "user@example.com",
            NormalizedEmail = "USER@EXAMPLE.COM",
            PasswordHash = "hash",
            Status = "active"
        };
        user.Aliases.Add(alias);
        var accounts = new InMemoryAccountRepository(user);
        var service = new AccountManagementService(
            accounts,
            new InMemoryAliasRepository(),
            new InMemoryDestinationService { ShouldFail = true },
            new InMemoryKvWriter { ShouldFail = true },
            new FixedTimeProvider(DateTimeOffset.UtcNow));

        var result = await service.DeleteAccountAsync(userId, CancellationToken.None);

        Assert.True(result);
        Assert.Null(accounts.FindUserById(userId));
    }

    [Fact]
    public async Task DeleteAccount_UserMissing_ReturnsFalse()
    {
        var service = new AccountManagementService(
            new InMemoryAccountRepository(new PosternUser
            {
                Id = Guid.NewGuid(),
                Email = "x@e.com",
                NormalizedEmail = "X@E.COM",
                PasswordHash = "h",
                Status = "active"
            }),
            new InMemoryAliasRepository(),
            new InMemoryDestinationService(),
            new InMemoryKvWriter(),
            new FixedTimeProvider(DateTimeOffset.UtcNow));

        Assert.False(await service.DeleteAccountAsync(Guid.NewGuid(), CancellationToken.None));
    }

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    private sealed class InMemoryDestinationService : IDestinationService
    {
        private readonly HashSet<string> _verified = new(StringComparer.OrdinalIgnoreCase);

        public bool AutoVerify { get; set; } = true;

        public List<string> Destinations { get; } = [];

        public List<string> Removed { get; } = [];

        public bool ShouldFail { get; set; }

        public Task AddAsync(string forwardingAddress, CancellationToken cancellationToken)
        {
            if (ShouldFail)
            {
                throw new InvalidOperationException("The destination service is configured to fail.");
            }

            if (!Destinations.Contains(forwardingAddress, StringComparer.OrdinalIgnoreCase))
            {
                Destinations.Add(forwardingAddress);
            }

            if (AutoVerify)
            {
                _verified.Add(forwardingAddress);
            }

            return Task.CompletedTask;
        }

        public Task<bool> IsVerifiedAsync(string emailAddress, CancellationToken cancellationToken) =>
            Task.FromResult(_verified.Contains(emailAddress));

        public Task RemoveAsync(string forwardingAddress, CancellationToken cancellationToken)
        {
            if (ShouldFail)
            {
                throw new InvalidOperationException("The destination service is configured to fail.");
            }

            Removed.Add(forwardingAddress);
            return Task.CompletedTask;
        }
    }
}
