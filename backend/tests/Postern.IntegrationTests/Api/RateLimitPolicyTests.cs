using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
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

    /// <summary>
    /// The limiter must use the hop appended by our own proxy, not whatever the client
    /// prepended. A client that sends a forged leading address and a real trailing one must
    /// share the trailing address's bucket; otherwise every request could claim a fresh
    /// identity and no policy above would ever fire.
    /// </summary>
    [Fact]
    public async Task Registration_IgnoresAClientSuppliedLeadingForwardedForAddress()
    {
        using var client = _factory.CreateClient();

        for (var attempt = 0; attempt < 5; attempt++)
        {
            Assert.NotEqual(
                HttpStatusCode.TooManyRequests,
                await PostAsync(client, "/api/auth/register", "198.51.100.7, 203.0.113.30"));
        }

        Assert.Equal(
            HttpStatusCode.TooManyRequests,
            await PostAsync(client, "/api/auth/register", "203.0.113.30"));
    }

    /// <summary>
    /// QR1.5: the throttle policy list is itself an inventory. Every endpoint that accepts
    /// unauthenticated credentials must declare a policy; without this sweep a newly added
    /// login-adjacent route ships unbounded and only the boundary tests above would have to
    /// </summary>
    [Fact]
    public void EveryAnonymousCredentialEndpoint_DeclaresARateLimitingPolicy()
    {
        var endpoints = _factory.Endpoints
            .OfType<Microsoft.AspNetCore.Routing.RouteEndpoint>()
            .Where(endpoint => MethodsFor(endpoint).Contains("POST", StringComparer.OrdinalIgnoreCase))
            .Where(endpoint => IsCredentialSurface(endpoint.RoutePattern.RawText))
            .Where(endpoint => endpoint.Metadata.GetMetadata<Microsoft.AspNetCore.Authorization.IAuthorizeData>() is null)
            .Select(endpoint => new
            {
                Path = "/" + (endpoint.RoutePattern.RawText ?? string.Empty).TrimStart('/'),
                Policy = endpoint.Metadata.GetMetadata<EnableRateLimitingAttribute>()?.PolicyName,
            })
            .ToList();

        Assert.NotEmpty(endpoints);

        var unthrottled = endpoints
            .Where(endpoint => string.IsNullOrWhiteSpace(endpoint.Policy))
            .Select(endpoint => endpoint.Path)
            .ToList();

        Assert.True(
            unthrottled.Count == 0,
            "These credential-accepting endpoints have no rate-limiting policy: "
            + string.Join(", ", unthrottled));

        var policies = endpoints
            .Select(endpoint => endpoint.Policy!)
            .ToHashSet(StringComparer.Ordinal);
        var expected = new[] { "registration", "login", "admin-mfa", "recovery", "invite-request" };
        Assert.Equal(expected.Order(), policies.Order());
    }

    private static bool IsCredentialSurface(string? rawText)
    {
        var path = "/" + (rawText ?? string.Empty).TrimStart('/');
        return path.StartsWith("/api/auth", StringComparison.OrdinalIgnoreCase)
            || path.Equals("/api/invite-requests", StringComparison.OrdinalIgnoreCase);
    }

    private static IEnumerable<string> MethodsFor(
        Microsoft.AspNetCore.Routing.RouteEndpoint endpoint)
    {
        var metadata = endpoint.Metadata.GetMetadata<HttpMethodMetadata>();
        return metadata is { HttpMethods.Count: > 0 } ? metadata.HttpMethods : ["GET"];
    }

    /// <summary>
    /// The limiter partitions on the connection's remote address, which is
    /// only trustworthy when exactly one proxy hop is unpeeled
    /// </summary>
    [Fact]
    public void ForwardedHeaders_TrustExactlyOneProxyHop()
    {
        var options = _factory.Services
            .GetRequiredService<IOptions<ForwardedHeadersOptions>>()
            .Value;

        Assert.Equal(ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto, options.ForwardedHeaders);
        Assert.Equal(1, options.ForwardLimit);
        Assert.Empty(options.KnownProxies);
        Assert.Empty(options.KnownIPNetworks);
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
