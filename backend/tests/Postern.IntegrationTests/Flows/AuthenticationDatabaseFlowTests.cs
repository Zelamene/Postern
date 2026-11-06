using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Postern.Api.Security;
using Postern.Application.Accounts;
using Postern.Domain.Accounts;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Flows;

[Collection(IntegrationCollection.Name)]
public sealed class AuthenticationDatabaseFlowTests(PosternFixture fixture) : IAsyncLifetime
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
    public async Task RegisterWithBoundInvite_VerifyDestination_LoginAndLogout_PersistsAccountState()
    {
        var email = $"auth-flow-{Guid.NewGuid():N}@example.test";
        using var client = _factory.CreateClient();

        var inviteResponse = await client.PostAsJsonAsync("/api/dev/invites", new { email });
        Assert.Equal(HttpStatusCode.Created, inviteResponse.StatusCode);
        var invite = await inviteResponse.Content.ReadFromJsonAsync<DevelopmentInviteResponse>();
        Assert.NotNull(invite);
        Assert.Equal(email, invite.Email);
        Assert.StartsWith("postern_invite_", invite.Code);

        var register = await client.PostAsJsonAsync(
            "/api/auth/register",
            new { password = "correct horse battery staple", inviteCode = invite.Code });
        Assert.Equal(HttpStatusCode.Accepted, register.StatusCode);

        var pendingLogin = await client.PostAsJsonAsync(
            "/api/auth/login",
            new { email, password = "correct horse battery staple" });
        Assert.Equal(HttpStatusCode.Forbidden, pendingLogin.StatusCode);

        var verify = await client.PostAsync(
            $"/api/dev/destinations/{Uri.EscapeDataString(email)}/verify",
            content: null);
        Assert.Equal(HttpStatusCode.NoContent, verify.StatusCode);

        var login = await client.PostAsJsonAsync(
            "/api/auth/login",
            new { email, password = "correct horse battery staple" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        Assert.Contains("no-store", login.Headers.CacheControl?.ToString(), StringComparison.OrdinalIgnoreCase);
        var loginBody = await login.Content.ReadFromJsonAsync<LoginResponse>();
        Assert.NotNull(loginBody);
        Assert.Equal(email, loginBody.Email);
        Assert.NotNull(loginBody.RecoveryKey);

        var setCookie = Assert.Single(login.Headers.GetValues("Set-Cookie"));
        Assert.Contains(JwtTokenIssuer.CookieName, setCookie, StringComparison.Ordinal);
        client.DefaultRequestHeaders.Add("Cookie", setCookie.Split(';', StringSplitOptions.TrimEntries)[0]);

        var me = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.OK, me.StatusCode);
        var current = await me.Content.ReadFromJsonAsync<CurrentAccountResponse>();
        Assert.NotNull(current);
        Assert.Equal(email, current.Email);
        Assert.Equal(email, current.ForwardingAddress);

        var logout = await client.PostAsync("/api/auth/logout", content: null);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        client.DefaultRequestHeaders.Remove("Cookie");

        var afterLogout = await client.GetAsync("/api/auth/me");
        Assert.Equal(HttpStatusCode.Unauthorized, afterLogout.StatusCode);
    }

    [Fact]
    public async Task LoginWithUnknownAccountOrWrongPassword_ReturnsUnauthorized()
    {
        var email = $"auth-invalid-{Guid.NewGuid():N}@example.test";
        using var setupClient = _factory.CreateClient();
        var invite = await (await setupClient.PostAsJsonAsync("/api/dev/invites", new { email }))
            .Content.ReadFromJsonAsync<DevelopmentInviteResponse>();
        Assert.NotNull(invite);
        Assert.Equal(HttpStatusCode.Accepted,
            (await setupClient.PostAsJsonAsync("/api/auth/register",
                new { password = "correct horse battery staple", inviteCode = invite.Code })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await setupClient.PostAsync($"/api/dev/destinations/{Uri.EscapeDataString(email)}/verify", null)).StatusCode);

        using var client = _factory.CreateClient();
        var unknown = await client.PostAsJsonAsync("/api/auth/login",
            new { email = $"nobody-{Guid.NewGuid():N}@example.test", password = "correct horse battery staple" });
        Assert.Equal(HttpStatusCode.Unauthorized, unknown.StatusCode);

        var wrongPassword = await client.PostAsJsonAsync("/api/auth/login",
            new { email, password = "definitely not the password" });
        Assert.Equal(HttpStatusCode.Unauthorized, wrongPassword.StatusCode);
    }

    [Fact]
    public async Task RecoveryWithValidKey_RotatesCredentialsAndRejectsReuse()
    {
        var email = $"auth-recovery-{Guid.NewGuid():N}@example.test";
        using var client = _factory.CreateClient();
        var invite = await (await client.PostAsJsonAsync("/api/dev/invites", new { email }))
            .Content.ReadFromJsonAsync<DevelopmentInviteResponse>();
        Assert.NotNull(invite);
        Assert.Equal(HttpStatusCode.Accepted,
            (await client.PostAsJsonAsync("/api/auth/register",
                new { password = "correct horse battery staple", inviteCode = invite.Code })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent,
            (await client.PostAsync($"/api/dev/destinations/{Uri.EscapeDataString(email)}/verify", null)).StatusCode);

        var login = await client.PostAsJsonAsync("/api/auth/login",
            new { email, password = "correct horse battery staple" });
        Assert.Equal(HttpStatusCode.OK, login.StatusCode);
        var loginBody = await login.Content.ReadFromJsonAsync<LoginResponse>();
        Assert.NotNull(loginBody?.RecoveryKey);

        var recover = await client.PostAsJsonAsync("/api/auth/recovery",
            new { recoveryKey = loginBody.RecoveryKey, newPassword = "new correct horse battery staple" });
        Assert.Equal(HttpStatusCode.OK, recover.StatusCode);
        Assert.Contains("no-store", recover.Headers.CacheControl?.ToString(), StringComparison.OrdinalIgnoreCase);
        var recovered = await recover.Content.ReadFromJsonAsync<RecoveryResponse>();
        Assert.NotNull(recovered?.RecoveryKey);
        Assert.NotEqual(loginBody.RecoveryKey, recovered.RecoveryKey);

        var reusedOldKey = await client.PostAsJsonAsync("/api/auth/recovery",
            new { recoveryKey = loginBody.RecoveryKey, newPassword = "another correct horse battery staple" });
        Assert.Equal(HttpStatusCode.Unauthorized, reusedOldKey.StatusCode);

        var invalidKey = await client.PostAsJsonAsync("/api/auth/recovery",
            new { recoveryKey = "not-a-real-recovery-key", newPassword = "another correct horse battery staple" });
        Assert.Equal(HttpStatusCode.Unauthorized, invalidKey.StatusCode);

        var oldPassword = await client.PostAsJsonAsync("/api/auth/login",
            new { email, password = "correct horse battery staple" });
        Assert.Equal(HttpStatusCode.Unauthorized, oldPassword.StatusCode);

        var newPassword = await client.PostAsJsonAsync("/api/auth/login",
            new { email, password = "new correct horse battery staple" });
        Assert.Equal(HttpStatusCode.OK, newPassword.StatusCode);
    }

    [Fact]
    public async Task RegisterRejectsConsumedInviteAndPersistsSingleUser()
    {
        var email = $"auth-consumed-{Guid.NewGuid():N}@example.test";
        using var client = _factory.CreateClient();
        var invite = await (await client.PostAsJsonAsync("/api/dev/invites", new { email }))
            .Content.ReadFromJsonAsync<DevelopmentInviteResponse>();
        Assert.NotNull(invite);

        var first = await client.PostAsJsonAsync("/api/auth/register",
            new { password = "correct horse battery staple", inviteCode = invite.Code });
        Assert.Equal(HttpStatusCode.Accepted, first.StatusCode);

        var second = await client.PostAsJsonAsync("/api/auth/register",
            new { password = "correct horse battery staple", inviteCode = invite.Code });
        Assert.Equal(HttpStatusCode.BadRequest, second.StatusCode);
        var body = await second.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.Equal("invalid_invite", body?.Error);

        await using var db = fixture.CreateContext();
        var inviteCode = await db.InviteCodes.SingleAsync(item => item.CodeHash == AuthenticationService.HashInviteCode(invite.Code));
        Assert.NotNull(inviteCode.UsedAt);
        Assert.Equal(1, await db.Users.CountAsync(user => user.Email == email));
    }

    [Fact]
    public async Task RegisterRejectsExpiredInvite()
    {
        var email = $"auth-expired-{Guid.NewGuid():N}@example.test";
        var code = $"postern_invite_{Guid.NewGuid():N}";
        await using (var db = fixture.CreateContext())
        {
            db.InviteCodes.Add(new InviteCode
            {
                Id = Guid.NewGuid(),
                CodeHash = AuthenticationService.HashInviteCode(code),
                Email = email,
                EmailNormalized = EmailAddressNormalizer.NormalizeIdentity(email),
                CreatedAt = DateTimeOffset.UtcNow.AddDays(-2),
                ExpiresAt = DateTimeOffset.UtcNow.AddMinutes(-1),
                DeliveryStatus = InviteDeliveryStatus.Pending
            });
            await db.SaveChangesAsync();
        }

        using var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync("/api/auth/register",
            new { password = "correct horse battery staple", inviteCode = code });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<ErrorResponse>();
        Assert.Equal("invalid_invite", body?.Error);
    }

    private sealed record DevelopmentInviteResponse(string Code, string Email, string RegistrationPath);
    private sealed record LoginResponse(Guid? UserId, string? Email, string? RecoveryKey);
    private sealed record RecoveryResponse(string RecoveryKey);
    private sealed record CurrentAccountResponse(Guid UserId, string Email, string? ForwardingAddress);
    private sealed record ErrorResponse(string? Error);
}
