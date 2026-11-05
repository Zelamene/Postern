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
    public async Task ChangeForwardingAddress_RemovesOldDestination_AddsNew_UpdatesForwardingAddressOnly()
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
        var kvWriter = new Fakes.InMemoryKvWriter();
        var timeProvider = new FixedTimeProvider(DateTimeOffset.UtcNow);
        var service = new AccountManagementService(accounts, new InMemoryAliasRepository(), destinations, kvWriter, timeProvider);

        var result = await service.ChangeForwardingAddressAsync(userId, "new@example.com", CancellationToken.None);
        Assert.True(result);
        Assert.Equal(["old@example.com"], destinations.Removed);
        Assert.Equal(["new@example.com"], destinations.Added);
        Assert.Equal("new@example.com", user.ForwardingAddress);
        Assert.Equal("new@example.com", user.EffectiveForwardingAddress);

        // Login identity must survive a forwarding change.
        Assert.Equal("old@example.com", user.Email);
        Assert.Equal("OLD@EXAMPLE.COM", user.NormalizedEmail);
        Assert.NotNull(await accounts.FindByNormalizedEmailAsync("OLD@EXAMPLE.COM", CancellationToken.None));
    }

    [Fact]
    public async Task ChangeForwardingAddress_SecondChange_RemovesCurrentForwardingAddressNotLoginEmail()
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
        var destinations = new InMemoryDestinationService();
        var kvWriter = new Fakes.InMemoryKvWriter();
        var timeProvider = new FixedTimeProvider(DateTimeOffset.UtcNow);
        var service = new AccountManagementService(accounts, new InMemoryAliasRepository(), destinations, kvWriter, timeProvider);

        Assert.True(await service.ChangeForwardingAddressAsync(userId, "second@example.com", CancellationToken.None));

        Assert.Equal(["first@example.com"], destinations.Removed);
        Assert.Equal(["second@example.com"], destinations.Added);
        Assert.Equal("login@example.com", user.Email);
        Assert.Equal("LOGIN@EXAMPLE.COM", user.NormalizedEmail);
    }

    [Fact]
    public async Task ChangeForwardingAddress_WithoutPriorForwardingAddress_UsesLoginEmail()
    {
        var userId = Guid.NewGuid();
        var user = new PosternUser
        {
            Id = userId,
            Email = "login@example.com",
            NormalizedEmail = "LOGIN@EXAMPLE.COM",
            PasswordHash = "hash",
            Status = "active"
        };

        var accounts = new InMemoryAccountRepository(user);
        var destinations = new InMemoryDestinationService();
        var kvWriter = new Fakes.InMemoryKvWriter();
        var timeProvider = new FixedTimeProvider(DateTimeOffset.UtcNow);
        var service = new AccountManagementService(accounts, new InMemoryAliasRepository(), destinations, kvWriter, timeProvider);

        Assert.True(await service.ChangeForwardingAddressAsync(userId, "new@example.com", CancellationToken.None));

        Assert.Equal(["login@example.com"], destinations.Removed);
        Assert.Equal(["new@example.com"], destinations.Added);
    }

    [Fact]
    public async Task ChangeForwardingAddress_EmptyAddress_ReturnsFalse()
    {
        var userId = Guid.NewGuid();
        var user = new PosternUser { Id = userId, Email = "old@example.com", NormalizedEmail = "OLD@EXAMPLE.COM", PasswordHash = "hash", Status = "active" };
        var accounts = new InMemoryAccountRepository(user);
        var destinations = new InMemoryDestinationService();
        var kvWriter = new Fakes.InMemoryKvWriter();
        var timeProvider = new FixedTimeProvider(DateTimeOffset.UtcNow);
        var service = new AccountManagementService(accounts, new InMemoryAliasRepository(), destinations, kvWriter, timeProvider);

        var result = await service.ChangeForwardingAddressAsync(userId, "   ", CancellationToken.None);
        Assert.False(result);
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
        var kvWriter = new Fakes.InMemoryKvWriter();
        kvWriter.PutAsync("test-abcd1234@postern.local", "{}", CancellationToken.None).GetAwaiter().GetResult();
        var timeProvider = new FixedTimeProvider(new DateTimeOffset(2026, 10, 28, 13, 0, 0, TimeSpan.Zero));
        var service = new AccountManagementService(accounts, new InMemoryAliasRepository(), destinations, kvWriter, timeProvider);

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
    public async Task DeleteAccount_BestEffort_WhenKvFails_StillDeletesAccount()
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

        var user = new PosternUser { Id = userId, Email = "user@example.com", NormalizedEmail = "USER@EXAMPLE.COM", PasswordHash = "hash", Status = "active" };
        user.Aliases.Add(alias);
        var accounts = new InMemoryAccountRepository(user);
        var destinations = new InMemoryDestinationService { ShouldFail = true };
        var kvWriter = new Fakes.InMemoryKvWriter { ShouldFail = true };
        var timeProvider = new FixedTimeProvider(DateTimeOffset.UtcNow);
        var service = new AccountManagementService(accounts, new InMemoryAliasRepository(), destinations, kvWriter, timeProvider);

        var result = await service.DeleteAccountAsync(userId, CancellationToken.None);
        Assert.True(result);
        Assert.Null(accounts.FindUserById(userId));
    }

    private sealed class FixedTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => utcNow;
    }

    private sealed class InMemoryDestinationService : IDestinationService
    {
        public List<string> Added { get; } = [];
        public List<string> Removed { get; } = [];
        public bool ShouldFail { get; set; }

        public Task AddAsync(string forwardingAddress, CancellationToken cancellationToken)
        {
            if (ShouldFail) throw new Exception("fail");
            Added.Add(forwardingAddress);
            return Task.CompletedTask;
        }

        public Task<bool> IsVerifiedAsync(string emailAddress, CancellationToken cancellationToken) => Task.FromResult(true);

        public Task RemoveAsync(string forwardingAddress, CancellationToken cancellationToken)
        {
            if (ShouldFail) throw new Exception("fail");
            Removed.Add(forwardingAddress);
            return Task.CompletedTask;
        }
    }

    private sealed class InMemoryAccountRepository : IAccountRepository
    {
        private readonly Dictionary<Guid, PosternUser> _users = new();
        private readonly Dictionary<string, InviteCode> _invites = new(StringComparer.Ordinal);
        private readonly List<ExpectedSender> _expectedSenders = [];
        private readonly List<Domain.Activity.Message> _messages = [];
        private readonly List<BlockedMessage> _blockedMessages = [];

        public InMemoryAccountRepository(PosternUser user)
        {
            _users[user.Id] = user;
        }

        public PosternUser? FindUserById(Guid id) => _users.TryGetValue(id, out var u) ? u : null;
        public Alias? FindAliasById(Guid id) => _users.Values.SelectMany(u => u.Aliases).FirstOrDefault(a => a.Id == id);

        public Task<RegistrationResult> RegisterPendingUserAsync(PosternUser user, IReadOnlyCollection<string> legacyNormalizedEmails, string inviteCodeHash, int maximumUsers, DateTimeOffset now, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<PosternUser?> FindByNormalizedEmailAsync(string normalizedEmail, CancellationToken cancellationToken) => Task.FromResult(_users.Values.FirstOrDefault(u => u.NormalizedEmail == normalizedEmail));
        public Task<PosternUser?> FindByIdAsync(Guid userId, CancellationToken cancellationToken) => Task.FromResult(FindUserById(userId));
        public Task<PosternUser?> FindByAdminMfaChallengeAsync(string challengeHash, string purpose, DateTimeOffset now, CancellationToken cancellationToken) => Task.FromResult<PosternUser?>(null);
        public Task<bool> ActivatePendingUserAsync(Guid userId, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<bool> SetInitialRecoveryKeyHashAsync(Guid userId, string recoveryKeyHash, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<bool> SetAdminMfaChallengeAsync(Guid userId, string challengeHash, string purpose, DateTimeOffset expiresAt, CancellationToken cancellationToken) => Task.FromResult(false);
        public Task<bool> SetAdminTotpSecretAsync(Guid userId, string protectedSecret, CancellationToken cancellationToken) => Task.FromResult(false);
        public Task<bool> CompleteAdminTotpEnrollmentAsync(Guid userId, string challengeHash, string protectedSecret, long timeStep, DateTimeOffset now, CancellationToken cancellationToken) => Task.FromResult(false);
        public Task<bool> CompleteAdminMfaLoginAsync(Guid userId, string challengeHash, long timeStep, DateTimeOffset now, CancellationToken cancellationToken) => Task.FromResult(false);
        public Task<bool> RotateRecoveryCredentialsAsync(string currentRecoveryKeyHash, string passwordHash, string nextRecoveryKeyHash, CancellationToken cancellationToken) => throw new NotImplementedException();
        public Task<bool> UpdateForwardingAddressAsync(Guid userId, string newForwardingAddress, CancellationToken cancellationToken)
        {
            if (!_users.TryGetValue(userId, out var u)) return Task.FromResult(false);
            u.ForwardingAddress = newForwardingAddress;
            return Task.FromResult(true);
        }
        public Task AddInviteAsync(InviteCode invite, CancellationToken cancellationToken) =>
            throw new NotImplementedException();

        public Task<InviteCode> CreateInviteAsync(
            string email,
            string emailNormalized,
            CancellationToken cancellationToken)
        {
            var now = DateTimeOffset.UtcNow;
            var invite = new InviteCode
            {
                Id = Guid.NewGuid(),
                CodeHash = AuthenticationService.HashInviteCode(
                    $"postern_invite_{AuthenticationService.GenerateUrlSafeToken()}"),
                Email = email,
                EmailNormalized = emailNormalized,
                CreatedAt = now,
                ExpiresAt = now.AddDays(7)
            };
            _invites[invite.CodeHash] = invite;
            return Task.FromResult(invite);
        }

        public Task<IReadOnlyCollection<Guid>> ListSuspendedUserIdsAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyCollection<Guid>>(
                _users.Values.Where(u => u.Status == "suspended").Select(u => u.Id).ToList());

        public Task<bool> SetStatusAsync(Guid userId, string status, CancellationToken cancellationToken)
        {
            var user = _users.Values.SingleOrDefault(u => u.Id == userId);
            if (user is null)
            {
                return Task.FromResult(false);
            }

            user.Status = status;
            return Task.FromResult(true);
        }

        public Task<bool> DeleteAccountAsync(Guid userId, DateTimeOffset deletedAt, CancellationToken cancellationToken)
        {
            if (!_users.TryGetValue(userId, out var u)) return Task.FromResult(false);
            foreach (var alias in u.Aliases.ToList())
            {
                if (alias.Status != AliasStatus.Deleted)
                {
                    alias.Status = AliasStatus.Deleted;
                    alias.UserId = null;
                    alias.Label = null;
                    alias.RandomSuffix = null;
                    alias.FullAddress = null;
                    alias.PurposeMetadata = null;
                    alias.Category = null;
                    alias.ReplacedByAliasId = null;
                    alias.KvDirty = false;
                    alias.DeletedAt = deletedAt;
                }
            }
            _users.Remove(userId);
            return Task.FromResult(true);
        }
    }
}
