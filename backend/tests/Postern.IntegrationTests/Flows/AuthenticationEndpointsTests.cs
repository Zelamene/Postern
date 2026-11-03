using System.Security.Cryptography;
using System.Text;
using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Postern.Application.Accounts;
using Postern.Domain.Accounts;

namespace Postern.IntegrationTests.Flows;

public sealed class AuthenticationEndpointsTests
{
    [Fact]
    public async Task RegistrationVerificationLoginRecoveryAndLogoutWorkEndToEnd()
    {
        var repository = new InMemoryAccountRepository("test-invite");
        using var factory = CreateFactory(repository);
        using var client = factory.CreateClient();

        var register = await client.PostAsJsonAsync(
            "/api/auth/register",
            new { email = "user@example.test", password = "correct horse battery staple", inviteCode = "test-invite" });
        Assert.Equal(HttpStatusCode.Accepted, register.StatusCode);

        var pendingLogin = await client.PostAsJsonAsync(
            "/api/auth/login",
            new { email = "user@example.test", password = "correct horse battery staple" });
        Assert.Equal(HttpStatusCode.Forbidden, pendingLogin.StatusCode);

        var verification = await client.PostAsync(
            $"/api/dev/destinations/{Uri.EscapeDataString("user@example.test")}/verify",
            content: null);
        Assert.Equal(HttpStatusCode.NoContent, verification.StatusCode);

        var login = await client.PostAsJsonAsync(
            "/api/auth/login",
            new { email = "USER@example.test", password = "correct horse battery staple" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.Contains("no-store", login.Headers.CacheControl?.ToString());

        var loginBody = await login.Content.ReadFromJsonAsync<LoginResponse>();
        Assert.NotNull(loginBody?.RecoveryKey);
        var setCookie = Assert.Single(login.Headers.GetValues("Set-Cookie"));
        Assert.Contains("httponly", setCookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=strict", setCookie, StringComparison.OrdinalIgnoreCase);
        client.DefaultRequestHeaders.Add(
            "Cookie",
            setCookie.Split(';', StringSplitOptions.TrimEntries)[0]);

        var currentAccount = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, currentAccount.StatusCode);

        var recovery = await client.PostAsJsonAsync(
            "/api/auth/recovery",
            new { recoveryKey = loginBody!.RecoveryKey, newPassword = "new correct horse battery" });
        Assert.Equal(HttpStatusCode.OK, recovery.StatusCode);
        var recoveryBody = await recovery.Content.ReadFromJsonAsync<RecoveryResponse>();
        Assert.NotNull(recoveryBody?.RecoveryKey);
        Assert.NotEqual(loginBody.RecoveryKey, recoveryBody.RecoveryKey);

        var reusedKey = await client.PostAsJsonAsync(
            "/api/auth/recovery",
            new { recoveryKey = loginBody.RecoveryKey, newPassword = "another correct horse battery" });
        Assert.Equal(HttpStatusCode.Unauthorized, reusedKey.StatusCode);

        var logout = await client.PostAsync("/api/auth/logout", content: null);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        client.DefaultRequestHeaders.Remove("Cookie");
        var loggedOutAccount = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, loggedOutAccount.StatusCode);
    }

    [Fact]
    public async Task RecoveryEndpointIsRateLimited()
    {
        using var factory = CreateFactory(new InMemoryAccountRepository("test-invite"));
        using var client = factory.CreateClient();

        for (var attempt = 0; attempt < 5; attempt++)
        {
            var response = await client.PostAsJsonAsync(
                "/api/auth/recovery",
                new { recoveryKey = "postern_invalid", newPassword = "a valid new password" });
            Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        }

        var limitedResponse = await client.PostAsJsonAsync(
            "/api/auth/recovery",
            new { recoveryKey = "postern_invalid", newPassword = "a valid new password" });
        Assert.Equal(HttpStatusCode.TooManyRequests, limitedResponse.StatusCode);
    }

    [Fact]
    public async Task SignupAndLoginAcceptInternationalizedEmailAddresses()
    {
        var repository = new InMemoryAccountRepository("test-invite");
        using var factory = CreateFactory(repository);
        using var client = factory.CreateClient();

        var register = await client.PostAsJsonAsync(
            "/api/auth/register",
            new
            {
                email = "cafe\u0301@müller.de",
                password = "correct horse battery staple",
                inviteCode = "test-invite"
            });
        Assert.Equal(HttpStatusCode.Accepted, register.StatusCode);

        var verification = await client.PostAsync(
            $"/api/dev/destinations/{Uri.EscapeDataString("café@müller.de")}/verify",
            content: null);
        Assert.Equal(HttpStatusCode.NoContent, verification.StatusCode);

        var login = await client.PostAsJsonAsync(
            "/api/auth/login",
            new
            {
                email = "café@MÜLLER\u3002de",
                password = "correct horse battery staple"
            });

        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var loginBody = await login.Content.ReadFromJsonAsync<LoginResponse>();
        Assert.Equal("café@müller.de", loginBody?.Email);
    }

    [Fact]
    public async Task Register_RejectsMalformedEmailAndShortPassword()
    {
        using var factory = CreateFactory(new InMemoryAccountRepository("test-invite"));
        using var client = factory.CreateClient();

        var badEmail = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "not-an-email",
            password = "correct horse battery staple",
            inviteCode = "test-invite"
        });
        Assert.Equal(HttpStatusCode.BadRequest, badEmail.StatusCode);

        var shortPassword = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "user@example.test",
            password = "short",
            inviteCode = "test-invite"
        });
        Assert.Equal(HttpStatusCode.BadRequest, shortPassword.StatusCode);
    }

    [Fact]
    public async Task Register_RejectsUnknownInvite()
    {
        using var factory = CreateFactory(new InMemoryAccountRepository("test-invite"));
        using var client = factory.CreateClient();

        var response = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "user@example.test",
            password = "correct horse battery staple",
            inviteCode = "wrong-invite"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ErrorBody>();
        Assert.Equal("invalid_invite", body?.Error);
    }

    [Fact]
    public async Task Register_SecondTimeWithSameEmailConflicts()
    {
        using var factory = CreateFactory(new InMemoryAccountRepository("first-invite", "second-invite"));
        using var client = factory.CreateClient();

        var first = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "user@example.test",
            password = "correct horse battery staple",
            inviteCode = "first-invite"
        });
        Assert.Equal(HttpStatusCode.Accepted, first.StatusCode);

        var duplicate = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "user@example.test",
            password = "correct horse battery staple",
            inviteCode = "second-invite"
        });

        Assert.Equal(HttpStatusCode.Conflict, duplicate.StatusCode);
    }

    [Fact]
    public async Task Register_WithConsumedInviteIsRejected()
    {
        using var factory = CreateFactory(new InMemoryAccountRepository("test-invite"));
        using var client = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Accepted, (await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "first@example.test",
            password = "correct horse battery staple",
            inviteCode = "test-invite"
        })).StatusCode);

        var reused = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "second@example.test",
            password = "correct horse battery staple",
            inviteCode = "test-invite"
        });

        Assert.Equal(HttpStatusCode.BadRequest, reused.StatusCode);
    }

    [Fact]
    public async Task Login_RejectsWrongPasswordAndUnknownAccount()
    {
        var repository = new InMemoryAccountRepository("test-invite");
        using var factory = CreateFactory(repository);
        using var client = factory.CreateClient();

        await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "user@example.test",
            password = "correct horse battery staple",
            inviteCode = "test-invite"
        });
        await client.PostAsync(
            $"/api/dev/destinations/{Uri.EscapeDataString("user@example.test")}/verify",
            content: null);

        var wrongPassword = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "user@example.test",
            password = "definitely not the password"
        });
        Assert.Equal(HttpStatusCode.Unauthorized, wrongPassword.StatusCode);

        var unknownAccount = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "nobody@example.test",
            password = "correct horse battery staple"
        });
        Assert.Equal(HttpStatusCode.Unauthorized, unknownAccount.StatusCode);
    }

    [Fact]
    public async Task Me_ReturnsTheEffectiveForwardingAddress()
    {
        var repository = new InMemoryAccountRepository("test-invite");
        using var factory = CreateFactory(repository);
        using var client = factory.CreateClient();

        await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "user@example.test",
            password = "correct horse battery staple",
            inviteCode = "test-invite"
        });
        await client.PostAsync(
            $"/api/dev/destinations/{Uri.EscapeDataString("user@example.test")}/verify",
            content: null);
        var login = await client.PostAsJsonAsync("/api/auth/login", new
        {
            email = "user@example.test",
            password = "correct horse battery staple"
        });
        client.DefaultRequestHeaders.Add(
            "Cookie",
            Assert.Single(login.Headers.GetValues("Set-Cookie")).Split(';', StringSplitOptions.TrimEntries)[0]);

        var meResponse = await client.GetAsync("/api/auth/me");
        Assert.True(meResponse.Headers.CacheControl?.NoStore);

        var initial = await meResponse.Content.ReadFromJsonAsync<CurrentAccountResponse>();
        Assert.Equal("user@example.test", initial!.ForwardingAddress);

        repository.SetForwardingAddress("user@example.test", "inbox@elsewhere.test");

        var updated = await client.GetFromJsonAsync<CurrentAccountResponse>("/api/auth/me");
        Assert.Equal("inbox@elsewhere.test", updated!.ForwardingAddress);
    }

    [Fact]
    public async Task DevelopmentInvite_CanBeUsedOnceToRegister()
    {
        var repository = new InMemoryAccountRepository();
        using var factory = CreateFactory(repository);
        using var client = factory.CreateClient();

        var created = await client.PostAsync("/api/dev/invites", content: null);
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var invite = await created.Content.ReadFromJsonAsync<DevelopmentInviteResponse>();
        Assert.False(string.IsNullOrWhiteSpace(invite!.Code));

        var register = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "invited@example.test",
            password = "correct horse battery staple",
            inviteCode = invite.Code
        });
        Assert.Equal(HttpStatusCode.Accepted, register.StatusCode);

        var reuse = await client.PostAsJsonAsync("/api/auth/register", new
        {
            email = "second@example.test",
            password = "correct horse battery staple",
            inviteCode = invite.Code
        });
        Assert.Equal(HttpStatusCode.BadRequest, reuse.StatusCode);
    }

    private static WebApplicationFactory<Program> CreateFactory(InMemoryAccountRepository repository) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.UseSetting(
                "Authentication:SigningKey",
                "integration-test-key-material-at-least-thirty-two-bytes");
            builder.UseSetting(
                "ConnectionStrings:Postgres",
                "Host=localhost;Database=postern;Username=postern_app;Password=unused;Search Path=postern"); // pragma: allowlist secret
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IAccountRepository>();
                services.AddSingleton<IAccountRepository>(repository);
            });
        });

    private sealed record LoginResponse(Guid UserId, string Email, string? RecoveryKey);
    private sealed record CurrentAccountResponse(Guid UserId, string Email, string? ForwardingAddress);
    private sealed record DevelopmentInviteResponse(string Code);
    private sealed record RecoveryResponse(string RecoveryKey);
    private sealed record ErrorBody(string? Error);

    private sealed class InMemoryAccountRepository : IAccountRepository
    {
        private readonly Dictionary<string, PosternUser> _users = new(StringComparer.Ordinal);
        private readonly Dictionary<string, InviteCode> _invites = new(StringComparer.Ordinal);

        public InMemoryAccountRepository(params string[] inviteCodes)
        {
            foreach (var inviteCode in inviteCodes)
            {
                var hash = HashSecret(inviteCode);
                _invites.Add(hash, new InviteCode
                {
                    Id = Guid.NewGuid(),
                    CodeHash = hash,
                    CreatedAt = DateTimeOffset.UtcNow
                });
            }
        }

        public Task AddInviteAsync(InviteCode invite, CancellationToken cancellationToken)
        {
            _invites[invite.CodeHash] = invite;
            return Task.CompletedTask;
        }

        public void SetForwardingAddress(string normalizedEmail, string forwardingAddress)
        {
            var user = _users.Values.Single(item =>
                string.Equals(item.NormalizedEmail, normalizedEmail, StringComparison.OrdinalIgnoreCase));
            user.ForwardingAddress = forwardingAddress;
        }

        public Task<RegistrationResult> RegisterPendingUserAsync(
            PosternUser user,
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

            if (_users.ContainsKey(user.NormalizedEmail)
                || legacyNormalizedEmails.Any(_users.ContainsKey))
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
            _users.Add(user.NormalizedEmail, user);
            return Task.FromResult(RegistrationResult.Created);
        }

        public Task<PosternUser?> FindByNormalizedEmailAsync(
            string normalizedEmail,
            CancellationToken cancellationToken) =>
            Task.FromResult(_users.GetValueOrDefault(normalizedEmail));

        public Task<bool> ActivatePendingUserAsync(Guid userId, CancellationToken cancellationToken)
        {
            var user = _users.Values.SingleOrDefault(item =>
                item.Id == userId && item.Status == "pending");
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
            var user = _users.Values.SingleOrDefault(item =>
                item.Id == userId && item.Status == "active" && item.RecoveryKeyHash is null);
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
            var user = _users.Values.SingleOrDefault(item =>
                item.Status == "active" && item.RecoveryKeyHash == currentRecoveryKeyHash);
            if (user is null)
            {
                return Task.FromResult(false);
            }

            user.PasswordHash = passwordHash;
            user.RecoveryKeyHash = nextRecoveryKeyHash;
            return Task.FromResult(true);
        }

        public Task<PosternUser?> FindByIdAsync(Guid userId, CancellationToken cancellationToken) =>
            Task.FromResult(_users.Values.SingleOrDefault(user => user.Id == userId));

        public Task<bool> UpdateForwardingAddressAsync(Guid userId, string newEmail, CancellationToken cancellationToken)
        {
            var user = _users.Values.SingleOrDefault(item => item.Id == userId);
            if (user is null)
            {
                return Task.FromResult(false);
            }

            user.Email = newEmail;
            return Task.FromResult(true);
        }

        public Task<bool> DeleteAccountAsync(Guid userId, DateTimeOffset deletedAt, CancellationToken cancellationToken)
        {
            var user = _users.Values.SingleOrDefault(item => item.Id == userId);
            if (user is null)
            {
                return Task.FromResult(false);
            }

            _users.Remove(user.NormalizedEmail);
            return Task.FromResult(true);
        }

        public Task<IReadOnlyCollection<Guid>> ListSuspendedUserIdsAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyCollection<Guid>>(
                _users.Values.Where(user => user.Status == "suspended").Select(user => user.Id).ToList());

        public Task<bool> SetStatusAsync(Guid userId, string status, CancellationToken cancellationToken)
        {
            var user = _users.Values.SingleOrDefault(item => item.Id == userId);
            if (user is null)
            {
                return Task.FromResult(false);
            }

            user.Status = status;
            return Task.FromResult(true);
        }

        private static string HashSecret(string value) =>
            Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    }
}
