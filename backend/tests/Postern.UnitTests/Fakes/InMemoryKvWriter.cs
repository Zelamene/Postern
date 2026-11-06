using Postern.Application.Integrations;
using System.Collections.Concurrent;

namespace Postern.UnitTests.Fakes;

public sealed class InMemoryKvWriter : IKvWriter
{
    private readonly ConcurrentDictionary<string, string> _values = new(StringComparer.Ordinal);

    public bool ShouldFail { get; set; }

    public ISet<string> FailingKeys { get; } = new HashSet<string>(StringComparer.Ordinal);

    public IReadOnlyDictionary<string, string> Values => _values;

    public Task PutAsync(string key, string jsonValue, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ThrowIfConfiguredToFail(key);
        _values[key] = jsonValue;
        return Task.CompletedTask;
    }

    public Task DeleteAsync(string key, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ThrowIfConfiguredToFail(key);
        _values.TryRemove(key, out _);
        return Task.CompletedTask;
    }

    private void ThrowIfConfiguredToFail(string key)
    {
        if (ShouldFail || FailingKeys.Contains(key))
        {
            throw new InvalidOperationException("The in-memory KV writer is configured to fail.");
        }
    }
}
