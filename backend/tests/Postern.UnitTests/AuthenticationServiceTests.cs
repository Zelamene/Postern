using System.Security.Cryptography;
using System.Text;
using Postern.Application.Accounts;
using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public sealed class AuthenticationServiceTests
{
    [Fact]
    public async Task LoginRequiresDestinationVerificationThenIssuesRecoveryKeyOnce()
    {
        var repository = new InMemoryAccountRepository();
        var destinations = new InMemoryDestinationService();
        var service = CreateService(repository, destinations);

        var registration = await service.RegisterAsync(
            "user@example.test",
            "correct horse battery staple",
            "invite-one",
            CancellationToken.None);

        Assert.Equal(RegistrationResult.Created, registration);
        Assert.Contains("user@example.test", destinations.Destinations);

        var pendingLogin = await service.LoginAsync(
            "USER@example.test",
            "correct horse battery staple",
            CancellationToken.None);
        Assert.Equal(AuthenticationResult.VerificationRequired, pendingLogin.Result);

        destinations.MarkVerified("user@example.test");
        var verifiedLogin = await service.LoginAsync(
            "USER@example.test",
            "correct horse battery staple",
            CancellationToken.None);

        Assert.Equal(AuthenticationResult.Authenticated, verifiedLogin.Result);
        Assert.NotNull(verifiedLogin.Account?.RecoveryKey);
        Assert.Equal("active", repository.Users.Single().Status);

        var laterLogin = await service.LoginAsync(
            "user@example.test",
            "correct horse battery staple",
            CancellationToken.None);
        Assert.Equal(AuthenticationResult.Authenticated, laterLogin.Result);
        Assert.Null(laterLogin.Account?.RecoveryKey);
    }

    [Fact]
    public async Task RecoveryKeyResetsPasswordAndRotatesAfterEverySuccessfulUse()
    {
        var repository = new InMemoryAccountRepository();
        var destinations = new InMemoryDestinationService();
        var service = CreateService(repository, destinations);
        await service.RegisterAsync(
            "user@example.test",
            "correct horse battery staple",
            "invite-one",
            CancellationToken.None);
        destinations.MarkVerified("user@example.test");

        var login = await service.LoginAsync(
            "user@example.test",
            "correct horse battery staple",
            CancellationToken.None);
        var firstKey = Assert.IsType<string>(login.Account?.RecoveryKey);

        var secondKey = await service.ResetPasswordAsync(
            firstKey,
            "new correct horse battery",
            CancellationToken.None);

        Assert.NotNull(secondKey);
        Assert.Null(await service.ResetPasswordAsync(
            firstKey,
            "another correct horse battery",
            CancellationToken.None));
        Assert.Equal(
            AuthenticationResult.InvalidCredentials,
            (await service.LoginAsync(
                "user@example.test",
                "correct horse battery staple",
                CancellationToken.None)).Result);
        Assert.Equal(
            AuthenticationResult.Authenticated,
            (await service.LoginAsync(
                "user@example.test",
                "new correct horse battery",
                CancellationToken.None)).Result);

        var thirdKey = await service.ResetPasswordAsync(
            secondKey,
            "third correct horse battery",
            CancellationToken.None);
        Assert.NotNull(thirdKey);
        Assert.NotEqual(secondKey, thirdKey);
    }

    [Fact]
    public async Task RegistrationRejectsUsedInvitesAndEnforcesTheDestinationCap()
    {
        var repository = new InMemoryAccountRepository();
        var service = CreateService(repository, new InMemoryDestinationService());

        Assert.Equal(
            RegistrationResult.Created,
            await service.RegisterAsync(
                "first@example.test",
                "correct horse battery staple",
                "invite-one",
                CancellationToken.None));
        Assert.Equal(
            RegistrationResult.InvalidInvite,
            await service.RegisterAsync(
                "second@example.test",
                "correct horse battery staple",
                "invite-one",
                CancellationToken.None));

        repository.FillToCapacity();
        repository.AddInvite("invite-last");

        Assert.Equal(
            RegistrationResult.UserLimitReached,
            await service.RegisterAsync(
                "last@example.test",
                "correct horse battery staple",
                "invite-last",
                CancellationToken.None));
    }

    [Fact]
    public async Task RegistrationRejectsWeakPasswordsAndInvalidAddresses()
    {
        var service = CreateService(
            new InMemoryAccountRepository(),
            new InMemoryDestinationService());

        Assert.Equal(
            RegistrationResult.InvalidRequest,
            await service.RegisterAsync(
                "not-an-email",
                "short",
                "invite-one",
                CancellationToken.None));
    }

    [Theory]
    [InlineData("café@müller.de", true)]
    [InlineData("тест@почта.рф", true)]
    [InlineData("ユーザー@メール.クック", true)]
    [InlineData("user＠example.com", true)]
    [InlineData("user@例え。テスト", true)]
    [InlineData("user@مثال.إختبار", true)]
    [InlineData("user@مثال١.com", true)]
    [InlineData("user.name+tag@example.com", true)]
    [InlineData("\"user..name\"@example.com", true)]
    [InlineData("xn--4gbrim@xn--wgbh1c.xn--mgbaam7a8h", true)]
    [InlineData("user@[IPv6:2001:db8::1]", true)]
    [InlineData("user..name@example.com", false)]
    [InlineData("user@example.123", false)]
    [InlineData("user@exam_ple.com", false)]
    [InlineData("user@ab--cd.com", false)]
    [InlineData("user@xn--.com", false)]
    [InlineData("user@אabc.com", false)]
    [InlineData("user@abcא.com", false)]
    [InlineData("user@مثال1١.com", false)]
    [InlineData("user@example.", false)]
    [InlineData("@example.com", false)]
    [InlineData("user@example.c", false)]
    [InlineData("plain_text_no_at_sign", false)]
    [InlineData("user@[999.1.1.1]", false)]
    public void EmailAddressNormalizerAcceptsInternationalizedAddressesAndRejectsInvalidOnes(
        string email,
        bool expected)
    {
        Assert.Equal(expected, EmailAddressNormalizer.TryNormalize(email, out _));
    }

    [Fact]
    public void EmailAddressNormalizerRemovesIgnoredCharactersBeforeCanonicalizing()
    {
        Assert.True(EmailAddressNormalizer.TryNormalize(
            "u\u200bser＠example.com",
            out var normalizedEmail));

        Assert.Equal("user@example.com", normalizedEmail);
        Assert.Equal(
            EmailAddressNormalizer.NormalizeIdentity("user@example.com"),
            EmailAddressNormalizer.NormalizeIdentity("u\u200bser＠example.com"));
    }

    [Fact]
    public async Task InternationalizedSignupAndLoginUseEquivalentCanonicalAddress()
    {
        var repository = new InMemoryAccountRepository();
        var destinations = new InMemoryDestinationService();
        var service = CreateService(repository, destinations);

        var registration = await service.RegisterAsync(
            "cafe\u0301@müller.de",
            "correct horse battery staple",
            "invite-one",
            CancellationToken.None);

        Assert.Equal(RegistrationResult.Created, registration);
        Assert.Equal("café@müller.de", repository.Users.Single().Email);
        destinations.MarkVerified(repository.Users.Single().Email);

        var login = await service.LoginAsync(
            "café@MÜLLER\u3002de",
            "correct horse battery staple",
            CancellationToken.None);

        Assert.Equal(AuthenticationResult.Authenticated, login.Result);
        Assert.Equal("café@müller.de", login.Account?.Email);
    }

    [Fact]
    public async Task RegistrationPreservesLegacyAddressUniquenessWithoutDisclosingItForInvalidInvites()
    {
        var repository = new InMemoryAccountRepository();
        repository.AddLegacyUser("café@müller.de");
        var service = CreateService(repository, new InMemoryDestinationService());

        Assert.Equal(
            RegistrationResult.InvalidInvite,
            await service.RegisterAsync(
                "café@xn--mller-kva.de",
                "correct horse battery staple",
                "unknown-invite",
                CancellationToken.None));
        Assert.Equal(
            RegistrationResult.EmailAlreadyRegistered,
            await service.RegisterAsync(
                "café@xn--mller-kva.de",
                "correct horse battery staple",
                "invite-one",
                CancellationToken.None));
    }

    private static AuthenticationService CreateService(
        InMemoryAccountRepository repository,
        InMemoryDestinationService destinations) =>
        new(repository, destinations, new TestPasswordHashingService(), TimeProvider.System);

    private sealed class TestPasswordHashingService : IPasswordHashingService
    {
        public string HashPassword(string password) => Convert.ToBase64String(
            SHA256.HashData(Encoding.UTF8.GetBytes(password)));

        public bool VerifyPassword(string passwordHash, string password) =>
            CryptographicOperations.FixedTimeEquals(
                Convert.FromBase64String(passwordHash),
                SHA256.HashData(Encoding.UTF8.GetBytes(password)));
    }

    private sealed class InMemoryAccountRepository : IAccountRepository
    {
        private readonly List<Postern.Domain.Accounts.PosternUser> _users = [];
        private readonly Dictionary<string, Postern.Domain.Accounts.InviteCode> _invites = new(StringComparer.Ordinal);

        public InMemoryAccountRepository() => AddInvite("invite-one");

        public IReadOnlyList<Postern.Domain.Accounts.PosternUser> Users => _users;

        public Task<IReadOnlyCollection<Guid>> ListSuspendedUserIdsAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyCollection<Guid>>(
                _users.Where(u => u.Status == "suspended").Select(u => u.Id).ToList());

        public Task<bool> SetStatusAsync(Guid userId, string status, CancellationToken cancellationToken)
        {
            var user = _users.SingleOrDefault(u => u.Id == userId);
            if (user is null)
            {
                return Task.FromResult(false);
            }

            user.Status = status;
            return Task.FromResult(true);
        }

        public Task AddInviteAsync(Postern.Domain.Accounts.InviteCode invite, CancellationToken cancellationToken)
        {
            _invites[invite.CodeHash] = invite;
            return Task.CompletedTask;
        }

        public void AddInvite(string code)
        {
            var hash = HashSecret(code);
            _invites.TryAdd(hash, new Postern.Domain.Accounts.InviteCode
            {
                Id = Guid.NewGuid(),
                CodeHash = hash,
                CreatedAt = DateTimeOffset.UtcNow
            });
        }

        public void AddLegacyUser(string email)
        {
            var normalizedEmail = email.Trim().ToUpperInvariant();
            _users.Add(new Postern.Domain.Accounts.PosternUser
            {
                Id = Guid.NewGuid(),
                Email = email,
                NormalizedEmail = normalizedEmail,
                PasswordHash = "not-used",
                Status = "active"
            });
        }

        public void FillToCapacity()
        {
            while (_users.Count < AuthenticationService.MaximumUsers)
            {
                _users.Add(new Postern.Domain.Accounts.PosternUser
                {
                    Id = Guid.NewGuid(),
                    Email = $"user{_users.Count}@example.test",
                    NormalizedEmail = $"USER{_users.Count}@EXAMPLE.TEST",
                    PasswordHash = "not-used",
                    Status = "active"
                });
            }
        }

        public Task<RegistrationResult> RegisterPendingUserAsync(
            Postern.Domain.Accounts.PosternUser user,
            IReadOnlyCollection<string> legacyNormalizedEmails,
            string inviteCodeHash,
            int maximumUsers,
            DateTimeOffset now,
            CancellationToken cancellationToken)
        {
            if (!_invites.TryGetValue(inviteCodeHash, out var invite)
                || invite.UsedAt is not null
                || (invite.ExpiresAt is not null && invite.ExpiresAt <= now))
            {
                return Task.FromResult(RegistrationResult.InvalidInvite);
            }

            if (_users.Any(existing =>
                    existing.NormalizedEmail == user.NormalizedEmail
                    || legacyNormalizedEmails.Contains(existing.NormalizedEmail)))
            {
                return Task.FromResult(RegistrationResult.EmailAlreadyRegistered);
            }

            if (_users.Count >= maximumUsers)
            {
                return Task.FromResult(RegistrationResult.UserLimitReached);
            }

            user.InviteCodeUsedId = invite.Id;
            invite.UsedAt = now;
            invite.UsedByUserId = user.Id;
            _users.Add(user);
            return Task.FromResult(RegistrationResult.Created);
        }

        public Task<Postern.Domain.Accounts.PosternUser?> FindByNormalizedEmailAsync(
            string normalizedEmail,
            CancellationToken cancellationToken) =>
            Task.FromResult(_users.SingleOrDefault(user => user.NormalizedEmail == normalizedEmail));

        public Task<bool> ActivatePendingUserAsync(Guid userId, CancellationToken cancellationToken)
        {
            var user = _users.SingleOrDefault(item => item.Id == userId && item.Status == "pending");
            if (user is null)
            {
                return Task.FromResult(false);
            }

            user.Status = "active";
            return Task.FromResult(true);
        }

        public Task<bool> SetInitialRecoveryKeyHashAsync(
            Guid userId,
            string recoveryKeyHash,
            CancellationToken cancellationToken)
        {
            var user = _users.SingleOrDefault(item =>
                item.Id == userId
                && item.Status == "active"
                && item.RecoveryKeyHash is null);
            if (user is null)
            {
                return Task.FromResult(false);
            }

            user.RecoveryKeyHash = recoveryKeyHash;
            return Task.FromResult(true);
        }

        public Task<bool> RotateRecoveryCredentialsAsync(
            string currentRecoveryKeyHash,
            string passwordHash,
            string nextRecoveryKeyHash,
            CancellationToken cancellationToken)
        {
            var user = _users.SingleOrDefault(item =>
                item.Status == "active"
                && item.RecoveryKeyHash == currentRecoveryKeyHash);
            if (user is null)
            {
                return Task.FromResult(false);
            }

            user.PasswordHash = passwordHash;
            user.RecoveryKeyHash = nextRecoveryKeyHash;
            return Task.FromResult(true);
        }

        public Task<Postern.Domain.Accounts.PosternUser?> FindByIdAsync(Guid userId, CancellationToken cancellationToken) =>
            Task.FromResult(_users.SingleOrDefault(user => user.Id == userId));

        public Task<bool> UpdateForwardingAddressAsync(Guid userId, string newEmail, CancellationToken cancellationToken)
        {
            var user = _users.SingleOrDefault(item => item.Id == userId);
            if (user is null)
            {
                return Task.FromResult(false);
            }

            user.Email = newEmail;
            return Task.FromResult(true);
        }

        public Task<bool> DeleteAccountAsync(Guid userId, DateTimeOffset deletedAt, CancellationToken cancellationToken)
        {
            var user = _users.SingleOrDefault(item => item.Id == userId);
            if (user is null)
            {
                return Task.FromResult(false);
            }

            _users.Remove(user);
            return Task.FromResult(true);
        }

        private static string HashSecret(string value) =>
            Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    }
}
