using System.Net;
using System.Net.Http.Json;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Api;

[Collection(IntegrationCollection.Name)]
public sealed class RateLimitPolicyTests(PosternFixture fixture) : IAsyncLifetime
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
    public async Task Registration_RejectsTheSixthRequestInTheWindow()
    {
        using var client = _factory.CreateClient();

        await AssertAllowsThenThrottlesAsync(client, "/api/auth/register", permitted: 5);
    }

    [Fact]
    public async Task Login_RejectsTheEleventhRequestInTheWindow()
    {
        using var client = _factory.CreateClient();

        await AssertAllowsThenThrottlesAsync(client, "/api/auth/login", permitted: 10);
    }

    [Fact]
    public async Task AdminMfaChallenge_RejectsTheSixthRequestInTheWindow()
    {
        using var client = _factory.CreateClient();

        await AssertAllowsThenThrottlesAsync(client, "/api/auth/admin-mfa/verify", permitted: 5);
    }

    [Fact]
    public async Task Recovery_RejectsTheSixthRequestInTheWindow()
    {
        using var client = _factory.CreateClient();

        await AssertAllowsThenThrottlesAsync(client, "/api/auth/recovery", permitted: 5);
    }

    [Fact]
    public async Task InviteRequest_RejectsTheSixthRequestInTheWindow()
    {
        using var client = _factory.CreateClient();

        await AssertAllowsThenThrottlesAsync(client, "/api/invite-requests", permitted: 5);
    }

    [Fact]
    public async Task Registration_ThrottlesEachClientAddressSeparately()
    {
        using var client = _factory.CreateClient();

        for (var attempt = 0; attempt < 5; attempt++)
        {
            Assert.NotEqual(
                HttpStatusCode.TooManyRequests,
                await PostAsync(client, "/api/auth/register", "203.0.113.10"));
        }

        for (var attempt = 0; attempt < 5; attempt++)
        {
            Assert.NotEqual(
                HttpStatusCode.TooManyRequests,
                await PostAsync(client, "/api/auth/register", "203.0.113.11"));
        }

        Assert.Equal(
            HttpStatusCode.TooManyRequests,
            await PostAsync(client, "/api/auth/register", "203.0.113.10"));
        Assert.Equal(
            HttpStatusCode.TooManyRequests,
            await PostAsync(client, "/api/auth/register", "203.0.113.11"));
    }

    private static async Task AssertAllowsThenThrottlesAsync(
        HttpClient client,
        string path,
        int permitted)
    {
        for (var attempt = 0; attempt < permitted; attempt++)
        {
            var status = await PostAsync(client, path);
            Assert.NotEqual(HttpStatusCode.TooManyRequests, status);
        }

        Assert.Equal(HttpStatusCode.TooManyRequests, await PostAsync(client, path));
    }

    private static async Task<HttpStatusCode> PostAsync(
        HttpClient client,
        string path,
        string? forwardedFor = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = JsonContent.Create(new
            {
                email = "nobody@example.test",
                password = "not-a-real-password",
                inviteCode = "not-a-real-invite",
                code = "000000",
                recoveryKey = "not-a-real-recovery-key"
            })
        };

        if (forwardedFor is not null)
        {
            request.Headers.Add("X-Forwarded-For", forwardedFor);
        }

        using var response = await client.SendAsync(request);
        return response.StatusCode;
    }
}
