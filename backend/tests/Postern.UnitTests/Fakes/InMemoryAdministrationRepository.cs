using Postern.Application.Administration;
using Postern.Domain.Administration;

namespace Postern.UnitTests.Fakes;

public sealed class InMemoryAdministrationRepository : IAdministrationRepository
{
    private readonly Dictionary<string, GlobalBlockedDomain> _domains = new(StringComparer.Ordinal);

    public List<AdminAuditLogEntry> AuditEntries { get; } = [];

    public IReadOnlyCollection<GlobalBlockedDomain> Domains => _domains.Values;

    public void Seed(GlobalBlockedDomain domain) => _domains[domain.DomainEtld1] = domain;

    public Task<bool> AddBlockedDomainAsync(GlobalBlockedDomain domain, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (_domains.ContainsKey(domain.DomainEtld1))
        {
            return Task.FromResult(false);
        }

        _domains[domain.DomainEtld1] = domain;
        return Task.FromResult(true);
    }

    public Task<bool> RemoveBlockedDomainAsync(string domainEtld1, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult(_domains.Remove(domainEtld1));
    }

    public Task<IReadOnlyCollection<GlobalBlockedDomain>> ListBlockedDomainsAsync(
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return Task.FromResult<IReadOnlyCollection<GlobalBlockedDomain>>(_domains.Values.ToList());
    }

    public Task RecordAuditEntryAsync(AdminAuditLogEntry entry, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        AuditEntries.Add(entry);
        return Task.CompletedTask;
    }
}
