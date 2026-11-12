using System.Collections.Concurrent;
using Postern.Application.Integrations;

namespace Postern.Infrastructure.Integrations;

public sealed class DevelopmentDestinationService : IDestinationService
{
    private readonly ConcurrentDictionary<string, byte> _destinations = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, byte> _verifiedDestinations = new(StringComparer.OrdinalIgnoreCase);

    public Task AddAsync(string emailAddress, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _destinations.TryAdd(emailAddress, 0);
        return Task.CompletedTask;
    }

    public Task<bool> IsVerifiedAsync(string emailAddress, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_verifiedDestinations.ContainsKey(emailAddress));
    }

    public Task RemoveAsync(string emailAddress, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _destinations.TryRemove(emailAddress, out _);
        _verifiedDestinations.TryRemove(emailAddress, out _);
        return Task.CompletedTask;
    }

    public bool MarkVerified(string emailAddress)
    {
        _destinations.TryAdd(emailAddress, 0);
        _verifiedDestinations.TryAdd(emailAddress, 0);
        return true;
    }
}
