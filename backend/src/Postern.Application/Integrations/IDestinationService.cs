namespace Postern.Application.Integrations;

public interface IDestinationService
{
    Task AddAsync(string emailAddress, CancellationToken cancellationToken);
    Task<bool> IsVerifiedAsync(string emailAddress, CancellationToken cancellationToken);
    Task RemoveAsync(string emailAddress, CancellationToken cancellationToken);
}
