using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Postern.Api.Workers;
using Postern.Application.Accounts;
using Postern.Application.Activity;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Api;

[Collection(IntegrationCollection.Name)]
public sealed class CapacityEnvelopeTests(PosternFixture fixture) : IAsyncLifetime
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
    public void AccountCeiling_MatchesTheDestinationQuotaAllowance()
    {
        Assert.Equal(199, AuthenticationService.MaximumUsers);
    }

    [Fact]
    public void DailyForwardingCap_IsFiveHundredMessages()
    {
        Assert.Equal(500, RateLimitService.DailyForwardingLimit);
    }

    [Fact]
    public void RateLimitProjection_RefreshesAtLeastEveryFiveMinutes()
    {
        Assert.True(
            RateLimitProjectionWorker.RefreshInterval <= TimeSpan.FromMinutes(5),
            $"The rate-limit projection refreshes every {RateLimitProjectionWorker.RefreshInterval}, " +
            "which exceeds the five-minute freshness bound.");
    }

    [Fact]
    public void RateLimitProjectionWorker_IsRegisteredAsAHostedService()
    {
        var workers = _factory.Services.GetServices<IHostedService>();

        Assert.Contains(workers, worker => worker is RateLimitProjectionWorker);
    }
}
