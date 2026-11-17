using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Postern.Api.Workers;
using Postern.Application.Activity;
using Postern.Application.Integrations;
using Postern.Domain.Activity;
using Postern.Domain.Aliases;

namespace Postern.IntegrationTests.Workers;

/// <summary>
/// QR5.3: the rate-limit projection must refresh at least every five minutes, and a
/// failed refresh must not stop the loop. The tick source is injected because
/// <see cref="PeriodicTimer"/> cannot be advanced by a fake <see cref="TimeProvider"/>.
/// </summary>
public sealed class RateLimitProjectionWorkerTests
{
    [Fact]
    public void TheRefreshInterval_IsWithinTheFiveMinuteBound()
    {
        Assert.True(
            RateLimitProjectionWorker.RefreshInterval <= TimeSpan.FromMinutes(5),
            $"The projection refreshes every {RateLimitProjectionWorker.RefreshInterval}.");
    }

    [Fact]
    public async Task EveryTick_RebuildsTheProjection()
    {
        var repository = new CountingRepository();
        using var provider = BuildProvider(repository);
        var ticker = new ScriptedTicker(ticks: 3);
        var worker = CreateWorker(provider, ticker);

        await worker.StartAsync(CancellationToken.None);
        await ticker.Completed.WaitAsync(TimeSpan.FromSeconds(10));
        await worker.StopAsync(CancellationToken.None);

        Assert.Equal(3, repository.CountCalls);
    }

    [Fact]
    public async Task AFailedRefresh_DoesNotStopTheLoop()
    {
        var repository = new CountingRepository { FailuresRemaining = 1 };
        using var provider = BuildProvider(repository);
        var ticker = new ScriptedTicker(ticks: 2);
        var worker = CreateWorker(provider, ticker);

        await worker.StartAsync(CancellationToken.None);
        await ticker.Completed.WaitAsync(TimeSpan.FromSeconds(10));
        await worker.StopAsync(CancellationToken.None);

        Assert.Equal(2, repository.CountCalls);
    }

    [Fact]
    public async Task StoppingTheHost_EndsTheLoopInsteadOfSpinning()
    {
        var repository = new CountingRepository();
        using var provider = BuildProvider(repository);
        var ticker = new BlockingTicker();
        var worker = CreateWorker(provider, ticker);

        await worker.StartAsync(CancellationToken.None);
        await ticker.WaitForFirstTick();
        await worker.StopAsync(CancellationToken.None);

        Assert.Equal(1, repository.CountCalls);
    }

    private static RateLimitProjectionWorker CreateWorker(
        IServiceProvider provider,
        IProjectionTicker ticker) =>
        new(
            provider.GetRequiredService<IServiceScopeFactory>(),
            ticker,
            NullLogger<RateLimitProjectionWorker>.Instance);

    private static ServiceProvider BuildProvider(IActivityRepository repository)
    {
        var services = new ServiceCollection();
        services.AddSingleton(repository);
        services.AddSingleton<IKvWriter>(new RecordingKvWriter());
        services.AddSingleton(TimeProvider.System);
        services.AddScoped<RateLimitService>();
        return services.BuildServiceProvider();
    }

    /// <summary>
    /// Hands out a fixed number of ticks immediately, then reports the loop finished.
    /// The ticker is deliberately not time based: the point of the test is that the
    /// worker refreshes once per tick, not how the tick is produced.
    /// </summary>
    private sealed class ScriptedTicker(int ticks) : IProjectionTicker
    {
        private readonly TaskCompletionSource _completed =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        private readonly TaskCompletionSource _firstTick =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int remaining = ticks;

        public Task Completed => _completed.Task;

        public Task WaitForFirstTick() => _firstTick.Task.WaitAsync(TimeSpan.FromSeconds(10));

        public ValueTask<bool> WaitForNextTickAsync(CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var next = Interlocked.Decrement(ref remaining);
            if (next < 0)
            {
                _completed.TrySetResult();
                return ValueTask.FromResult(false);
            }

            _firstTick.TrySetResult();
            return ValueTask.FromResult(true);
        }

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    /// <summary>
    /// Serves one tick, then parks until the host cancels. Proves that stopping the
    /// host ends the loop rather than leaving it spinning on an already-completed tick.
    /// </summary>
    private sealed class BlockingTicker : IProjectionTicker
    {
        private readonly TaskCompletionSource _firstTick =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
        private int served;

        public Task WaitForFirstTick() => _firstTick.Task.WaitAsync(TimeSpan.FromSeconds(10));

        public async ValueTask<bool> WaitForNextTickAsync(CancellationToken cancellationToken)
        {
            if (Interlocked.Increment(ref served) == 1)
            {
                _firstTick.TrySetResult();
                return true;
            }

            await Task.Delay(Timeout.Infinite, cancellationToken);
            return false;
        }

        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }

    private sealed class RecordingKvWriter : IKvWriter
    {
        public Task PutAsync(string key, string jsonValue, CancellationToken cancellationToken) =>
            Task.CompletedTask;

        public Task DeleteAsync(string key, CancellationToken cancellationToken) =>
            Task.CompletedTask;

        public Task<string?> GetAsync(string key, CancellationToken cancellationToken) =>
            Task.FromResult<string?>(null);

        public Task<IReadOnlyCollection<string>> ListKeysAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyCollection<string>>([]);
    }

    private sealed class CountingRepository : IActivityRepository
    {
        private int countCalls;

        public int CountCalls => Volatile.Read(ref countCalls);

        public int FailuresRemaining { get; set; }

        public Task<IReadOnlyDictionary<Guid, int>> CountForwardedMessagesPerUserAsync(
            DateTimeOffset receivedAfter,
            CancellationToken cancellationToken)
        {
            Interlocked.Increment(ref countCalls);

            if (FailuresRemaining > 0)
            {
                FailuresRemaining--;
                throw new InvalidOperationException("simulated projection read failure");
            }

            return Task.FromResult<IReadOnlyDictionary<Guid, int>>(
                new Dictionary<Guid, int>());
        }

        public Task<Alias?> FindAliasForIngestAsync(
            string fullAddressHash,
            CancellationToken cancellationToken) => Task.FromResult<Alias?>(null);

        public Task<Alias?> FindAliasForIngestWithExpectedSendersAsync(
            string fullAddressHash,
            CancellationToken cancellationToken) => Task.FromResult<Alias?>(null);

        public Task<bool> MessageIdExistsAsync(
            Guid aliasId,
            string messageId,
            CancellationToken cancellationToken) => Task.FromResult(false);

        public Task<Message> RecordMessageAsync(
            Message message,
            CancellationToken cancellationToken) => Task.FromResult(message);

        public Task<BlockedMessage> RecordBlockedMessageAsync(
            BlockedMessage blockedMessage,
            CancellationToken cancellationToken) => Task.FromResult(blockedMessage);

        public Task AddExpectedAddressSenderAsync(
            Guid aliasId,
            string senderAddress,
            string senderEtld1,
            DateTimeOffset createdAt,
            CancellationToken cancellationToken) => Task.CompletedTask;

        public Task<IReadOnlyList<Message>> ListMessagesAsync(
            Guid aliasId,
            DateTimeOffset receivedAfter,
            DateTimeOffset? beforeReceivedAt,
            Guid? beforeId,
            int limit,
            CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<Message>>([]);

        public Task<IReadOnlyList<BlockedMessage>> ListBlockedMessagesForUserAsync(
            Guid userId,
            Guid? aliasId,
            DateTimeOffset receivedAfter,
            DateTimeOffset? beforeReceivedAt,
            Guid? beforeId,
            int limit,
            CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<BlockedMessage>>([]);
    }
}
