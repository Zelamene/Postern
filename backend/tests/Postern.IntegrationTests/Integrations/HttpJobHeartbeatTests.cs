using System.Net;
using Microsoft.Extensions.Logging.Abstractions;
using Postern.Infrastructure.Integrations;

namespace Postern.IntegrationTests.Integrations;

public sealed class HttpJobHeartbeatTests
{
    private const string PingUrl = "https://heartbeat.example.test/api/v1/heartbeat/test";

    [Fact]
    public async Task NotifyCompletedAsync_PingsTheConfiguredUrl()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK);
        var heartbeat = new HttpJobHeartbeat(
            new HttpClient(handler),
            PingUrl,
            NullLogger<HttpJobHeartbeat>.Instance);

        await heartbeat.NotifyCompletedAsync(CancellationToken.None);

        Assert.Equal([PingUrl], handler.Requests.Select(request => request.AbsoluteUri));
    }

    [Fact]
    public async Task NotifyCompletedAsync_SkipsTheRequestWhenUnconfigured()
    {
        var handler = new RecordingHandler(HttpStatusCode.OK);
        var heartbeat = new HttpJobHeartbeat(
            new HttpClient(handler),
            string.Empty,
            NullLogger<HttpJobHeartbeat>.Instance);

        await heartbeat.NotifyCompletedAsync(CancellationToken.None);

        Assert.Empty(handler.Requests);
    }

    [Fact]
    public async Task NotifyCompletedAsync_SwallowsATransportFailure()
    {
        var heartbeat = new HttpJobHeartbeat(
            new HttpClient(new ThrowingHandler()),
            PingUrl,
            NullLogger<HttpJobHeartbeat>.Instance);

        var exception = await Record.ExceptionAsync(
            () => heartbeat.NotifyCompletedAsync(CancellationToken.None));

        Assert.Null(exception);
    }

    [Fact]
    public async Task NotifyCompletedAsync_SwallowsAnErrorStatus()
    {
        var handler = new RecordingHandler(HttpStatusCode.InternalServerError);
        var heartbeat = new HttpJobHeartbeat(
            new HttpClient(handler),
            PingUrl,
            NullLogger<HttpJobHeartbeat>.Instance);

        var exception = await Record.ExceptionAsync(
            () => heartbeat.NotifyCompletedAsync(CancellationToken.None));

        Assert.Null(exception);
        Assert.Single(handler.Requests);
    }

    private sealed class RecordingHandler(HttpStatusCode statusCode) : HttpMessageHandler
    {
        public List<Uri> Requests { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            Requests.Add(request.RequestUri!);
            return Task.FromResult(new HttpResponseMessage(statusCode));
        }
    }

    private sealed class ThrowingHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) =>
            throw new HttpRequestException("The heartbeat host is unreachable.");
    }
}
