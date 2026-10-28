using Postern.Application.Integrations;

namespace Postern.Infrastructure.Integrations;

public sealed class UnconfiguredDestinationService : IDestinationService
{
    public Task AddAsync(string emailAddress, CancellationToken cancellationToken) =>
        throw new InvalidOperationException("The Cloudflare destination service is not configured.");

    public Task<bool> IsVerifiedAsync(string emailAddress, CancellationToken cancellationToken) =>
        throw new InvalidOperationException("The Cloudflare destination service is not configured.");

    public Task RemoveAsync(string emailAddress, CancellationToken cancellationToken) =>
        throw new InvalidOperationException("The Cloudflare destination service is not configured.");
}
