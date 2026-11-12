using Postern.Application.Integrations;
using System.Collections.Concurrent;

namespace Postern.UnitTests.Fakes;

public sealed class InMemoryKvWriter : IKvWriter
{
    private readonly ConcurrentDictionary<string, string> _values = new(StringComparer.Ordinal);

    public bool ShouldFail { get; set; }

    public ISet<string> FailingKeys { get; } = new HashSet<string>(StringComparer.Ordinal);

    public IReadOnlyDictionary<string, string> Values => _values;

    public int Puts { get; private set; }

    public int Deletes { get; private set; }

    public Task PutAsync(string key, string jsonValue, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ThrowIfConfiguredToFail(key);
        _values[key] = jsonValue;
        Puts += 1;
        return Task.CompletedTask;
    }

    public Task DeleteAsync(string key, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ThrowIfConfiguredToFail(key);
        _values.TryRemove(key, out _);
        Deletes += 1;
        return Task.CompletedTask;
    }

    public Task<string?> GetAsync(string key, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ThrowIfConfiguredToFail(key);
        return Task.FromResult(_values.TryGetValue(key, out var value) ? value : null);
    }

    public Task<IReadOnlyCollection<string>> ListKeysAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (ShouldFail)
        {
            throw new InvalidOperationException("The in-memory KV writer is configured to fail.");
        }

        return Task.FromResult<IReadOnlyCollection<string>>(_values.Keys.ToArray());
    }

    private void ThrowIfConfiguredToFail(string key)
    {
        if (ShouldFail || FailingKeys.Contains(key))
        {
            throw new InvalidOperationException("The in-memory KV writer is configured to fail.");
        }
    }
}
