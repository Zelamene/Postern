using System.Net;
using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
using Postern.Infrastructure.Integrations;

namespace Postern.IntegrationTests.Infrastructure;

public sealed class CloudflareIntegrationsTests
{
    private static readonly CloudflareOptions Options = new()
    {
        AccountId = "account-id",
        ApiToken = "api-token",
        KvNamespaceId = "namespace-id"
    };

    [Fact]
    public async Task KvWriter_PutAsync_WritesTheValueToTheResolvedNamespace()
    {
        var handler = new StubHandler(_ => Json(HttpStatusCode.OK, new { success = true }));
        var writer = CreateKvWriter(handler);

        await writer.PutAsync("person@example.test", "{\"status\":\"active\"}", CancellationToken.None);

        var request = Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Put, request.Method);
        Assert.Equal(
            "https://api.cloudflare.com/client/v4/accounts/account-id/storage/kv/namespaces/namespace-id/values/person%40example.test",
            request.Url);
        Assert.Equal("{\"status\":\"active\"}", request.Body);
    }

    [Fact]
    public async Task KvWriter_GetAsync_ReturnsNullForMissingKeys()
    {
        var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.NotFound));
        var writer = CreateKvWriter(handler);

        var value = await writer.GetAsync("missing@example.test", CancellationToken.None);

        Assert.Null(value);
    }

    [Fact]
    public async Task KvWriter_ListKeysAsync_FollowsCursors()
    {
        var page = 0;
        var handler = new StubHandler(_ =>
        {
            page += 1;
            return page == 1
                ? Json(HttpStatusCode.OK, new
                {
                    success = true,
                    result = new[] { new { name = "first@example.test" } },
                    result_info = new { cursor = "next-page" }
                })
                : Json(HttpStatusCode.OK, new
                {
                    success = true,
                    result = new[] { new { name = "second@example.test" } },
                    result_info = new { cursor = (string?)null }
                });
        });
        var writer = CreateKvWriter(handler);

        var keys = await writer.ListKeysAsync(CancellationToken.None);

        Assert.Equal(["first@example.test", "second@example.test"], keys);
        Assert.Equal(2, handler.Requests.Count);
        Assert.Contains("cursor=next-page", handler.Requests[1].Url, StringComparison.Ordinal);
    }

    [Fact]
    public async Task KvWriter_DeleteAsync_IgnoresMissingKeys()
    {
        var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.NotFound));
        var writer = CreateKvWriter(handler);

        await writer.DeleteAsync("missing@example.test", CancellationToken.None);

        Assert.Equal(HttpMethod.Delete, Assert.Single(handler.Requests).Method);
    }

    [Fact]
    public async Task KvWriter_ThrowsWhenCloudflareRejectsTheWrite()
    {
        var handler = new StubHandler(_ => Json(
            HttpStatusCode.TooManyRequests,
            new { success = false, errors = new[] { new { code = 10000 } } }));
        var writer = CreateKvWriter(handler);

        await Assert.ThrowsAsync<HttpRequestException>(
            () => writer.PutAsync("person@example.test", "{}", CancellationToken.None));
    }

    [Fact]
    public async Task DestinationService_AddAsync_PostsOnlyWhenTheAddressIsMissing()
    {
        var handler = new StubHandler(request => request.Method == HttpMethod.Get
            ? Json(HttpStatusCode.OK, new { success = true, result = Array.Empty<object>() })
            : Json(HttpStatusCode.OK, new { success = true, result = new { id = "destination-id" } }));
        var service = CreateDestinationService(handler);

        await service.AddAsync("inbox@example.test", CancellationToken.None);

        Assert.Equal(2, handler.Requests.Count);
        Assert.Equal(HttpMethod.Get, handler.Requests[0].Method);
        Assert.Equal(HttpMethod.Post, handler.Requests[1].Method);
        Assert.Contains("\"email\":\"inbox@example.test\"", handler.Requests[1].Body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task DestinationService_AddAsync_SkipsExistingDestinations()
    {
        var handler = new StubHandler(_ => Json(HttpStatusCode.OK, new
        {
            success = true,
            result = new[] { new { id = "destination-id", email = "inbox@example.test", verified = (string?)null } }
        }));
        var service = CreateDestinationService(handler);

        await service.AddAsync("Inbox@Example.test", CancellationToken.None);

        Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Get, handler.Requests[0].Method);
    }

    [Fact]
    public async Task DestinationService_AddAsync_TreatsConflictAsSuccess()
    {
        var handler = new StubHandler(request => request.Method == HttpMethod.Get
            ? Json(HttpStatusCode.OK, new { success = true, result = Array.Empty<object>() })
            : new HttpResponseMessage(HttpStatusCode.Conflict));
        var service = CreateDestinationService(handler);

        await service.AddAsync("inbox@example.test", CancellationToken.None);

        Assert.Equal(2, handler.Requests.Count);
    }

    [Fact]
    public async Task DestinationService_IsVerifiedAsync_RequiresAVerifiedAddress()
    {
        var verifiedAt = "2026-10-30T12:00:00Z";
        var handler = new StubHandler(_ => Json(HttpStatusCode.OK, new
        {
            success = true,
            result = new[] { new { id = "destination-id", email = "inbox@example.test", verified = verifiedAt } }
        }));
        var service = CreateDestinationService(handler);

        Assert.True(await service.IsVerifiedAsync("inbox@example.test", CancellationToken.None));

        var unverified = new StubHandler(_ => Json(HttpStatusCode.OK, new
        {
            success = true,
            result = new[] { new { id = "destination-id", email = "inbox@example.test", verified = (string?)null } }
        }));
        Assert.False(await CreateDestinationService(unverified)
            .IsVerifiedAsync("inbox@example.test", CancellationToken.None));
    }

    [Fact]
    public async Task DestinationService_RemoveAsync_DeletesByCloudflareId()
    {
        var handler = new StubHandler(request => request.Method == HttpMethod.Get
            ? Json(HttpStatusCode.OK, new
            {
                success = true,
                result = new[] { new { id = "destination-id", email = "inbox@example.test", verified = (string?)null } }
            })
            : new HttpResponseMessage(HttpStatusCode.OK));
        var service = CreateDestinationService(handler);

        await service.RemoveAsync("inbox@example.test", CancellationToken.None);

        var delete = handler.Requests[1];
        Assert.Equal(HttpMethod.Delete, delete.Method);
        Assert.EndsWith("/email/routing/addresses/destination-id", delete.Url, StringComparison.Ordinal);
    }

    [Fact]
    public async Task DestinationService_RemoveAsync_IgnoresMissingDestinations()
    {
        var handler = new StubHandler(_ => Json(HttpStatusCode.OK, new
        {
            success = true,
            result = Array.Empty<object>()
        }));
        var service = CreateDestinationService(handler);

        await service.RemoveAsync("inbox@example.test", CancellationToken.None);

        Assert.Single(handler.Requests);
    }

    private static HttpClient CreateClient(StubHandler handler) =>
        new(handler)
        {
            BaseAddress = new Uri("https://api.cloudflare.com/client/v4/")
        };

    private static CloudflareKvWriter CreateKvWriter(StubHandler handler) =>
        new(CreateClient(handler), Options, NullLogger<CloudflareKvWriter>.Instance);

    private static CloudflareDestinationService CreateDestinationService(StubHandler handler) =>
        new(CreateClient(handler), Options, NullLogger<CloudflareDestinationService>.Instance);

    private static HttpResponseMessage Json(HttpStatusCode status, object payload) =>
        new(status)
        {
            Content = new StringContent(
                System.Text.Json.JsonSerializer.Serialize(payload, new System.Text.Json.JsonSerializerOptions
                {
                    PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.SnakeCaseLower
                }),
                Encoding.UTF8,
                "application/json")
        };

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> responder) : HttpMessageHandler
    {
        public List<(HttpMethod Method, string Url, string? Body)> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            var body = request.Content is null
                ? null
                : await request.Content.ReadAsStringAsync(cancellationToken);
            Requests.Add((request.Method, request.RequestUri!.ToString(), body));
            return responder(request);
        }
    }
}
