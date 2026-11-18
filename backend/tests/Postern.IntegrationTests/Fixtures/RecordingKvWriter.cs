using System.Collections.Concurrent;
using Postern.Application.Integrations;

namespace Postern.IntegrationTests.Fixtures;

public sealed class RecordingKvWriter : IKvWriter
{
    private readonly ConcurrentDictionary<string, string> _values = new(StringComparer.Ordinal);

    public bool ShouldFail { get; set; }

    public int PutCount { get; private set; }

    public int DeleteCount { get; private set; }

    private readonly ConcurrentDictionary<string, int> _putCountsByKey = new(StringComparer.Ordinal);

    public int PutsFor(string key) => _putCountsByKey.GetValueOrDefault(key);

    public IReadOnlyDictionary<string, string> Values => _values;

    public Task PutAsync(string key, string jsonValue, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (ShouldFail)
        {
            throw new InvalidOperationException("The recording KV writer is configured to fail.");
        }

        _values[key] = jsonValue;
        PutCount += 1;
        _putCountsByKey.AddOrUpdate(key, 1, (_, count) => count + 1);
        return Task.CompletedTask;
    }

    public Task DeleteAsync(string key, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (ShouldFail)
        {
            throw new InvalidOperationException("The recording KV writer is configured to fail.");
        }

        if (_values.TryRemove(key, out _))
        {
            DeleteCount += 1;
        }

        return Task.CompletedTask;
    }

    public Task<string?> GetAsync(string key, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_values.TryGetValue(key, out var value) ? value : null);
    }

    public Task<IReadOnlyCollection<string>> ListKeysAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult<IReadOnlyCollection<string>>(_values.Keys.ToArray());
    }

    public string? Get(string key) => _values.GetValueOrDefault(key);
}
