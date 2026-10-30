using Postern.Domain.Administration;

namespace Postern.Application.Administration;

public interface IAdministrationRepository
{
    Task<bool> AddBlockedDomainAsync(GlobalBlockedDomain domain, CancellationToken cancellationToken);

    Task<bool> RemoveBlockedDomainAsync(string domainEtld1, CancellationToken cancellationToken);

    Task<IReadOnlyCollection<GlobalBlockedDomain>> ListBlockedDomainsAsync(CancellationToken cancellationToken);

    Task RecordAuditEntryAsync(AdminAuditLogEntry entry, CancellationToken cancellationToken);
}
