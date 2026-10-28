using Postern.Application.Integrations;
using System.Collections.Concurrent;

namespace Postern.UnitTests.Fakes;

public sealed class InMemoryDestinationService : IDestinationService
{
    private readonly ConcurrentDictionary<string, byte> _destinations = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, byte> _verifiedDestinations = new(StringComparer.OrdinalIgnoreCase);

    public bool ShouldFail { get; set; }

    public IReadOnlyCollection<string> Destinations => _destinations.Keys.ToArray();

    public Task AddAsync(string emailAddress, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ThrowIfConfiguredToFail();
        _destinations.TryAdd(emailAddress, 0);
        return Task.CompletedTask;
    }

    public Task<bool> IsVerifiedAsync(string emailAddress, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ThrowIfConfiguredToFail();
        return Task.FromResult(_verifiedDestinations.ContainsKey(emailAddress));
    }

    public Task RemoveAsync(string emailAddress, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        ThrowIfConfiguredToFail();
        _destinations.TryRemove(emailAddress, out _);
        _verifiedDestinations.TryRemove(emailAddress, out _);
        return Task.CompletedTask;
    }

    public void MarkVerified(string emailAddress)
    {
        if (_destinations.ContainsKey(emailAddress))
        {
            _verifiedDestinations.TryAdd(emailAddress, 0);
        }
    }

    private void ThrowIfConfiguredToFail()
    {
        if (ShouldFail)
        {
            throw new InvalidOperationException("The in-memory destination service is configured to fail.");
        }
    }
}
