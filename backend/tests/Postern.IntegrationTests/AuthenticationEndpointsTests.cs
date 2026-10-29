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

namespace Postern.IntegrationTests;

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

    private static WebApplicationFactory<Program> CreateFactory(InMemoryAccountRepository repository) =>
        new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Development");
            builder.UseSetting(
                "Authentication:SigningKey",
                "integration-test-key-material-at-least-thirty-two-bytes");
            builder.UseSetting(
                "ConnectionStrings:Postgres",
                "Host=localhost;Database=postern;Username=postern_app;******;Search Path=postern");
            builder.ConfigureTestServices(services =>
            {
                services.RemoveAll<IAccountRepository>();
                services.AddSingleton<IAccountRepository>(repository);
            });
        });

    private sealed record LoginResponse(Guid UserId, string Email, string? RecoveryKey);
    private sealed record RecoveryResponse(string RecoveryKey);

    private sealed class InMemoryAccountRepository : IAccountRepository
    {
        private readonly Dictionary<string, PosternUser> _users = new(StringComparer.Ordinal);
        private readonly Dictionary<string, InviteCode> _invites = new(StringComparer.Ordinal);

        public InMemoryAccountRepository(string inviteCode)
        {
            var hash = HashSecret(inviteCode);
            _invites.Add(hash, new InviteCode
            {
                Id = Guid.NewGuid(),
                CodeHash = hash,
                CreatedAt = DateTimeOffset.UtcNow
            });
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

        private static string HashSecret(string value) =>
            Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    }
}
