using Microsoft.EntityFrameworkCore;
using Postern.Application.Administration;
using Postern.Domain.Administration;
using Postern.Infrastructure.Persistence;

namespace Postern.Infrastructure.Administration;

public sealed class EfAdministrationRepository(PosternDbContext dbContext) : IAdministrationRepository
{
    public async Task<bool> AddBlockedDomainAsync(
        GlobalBlockedDomain domain,
        CancellationToken cancellationToken)
    {
        var exists = await dbContext.GlobalBlocklist
            .AnyAsync(item => item.DomainEtld1 == domain.DomainEtld1, cancellationToken);
        if (exists)
        {
            return false;
        }

        dbContext.GlobalBlocklist.Add(domain);
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<bool> RemoveBlockedDomainAsync(
        string domainEtld1,
        CancellationToken cancellationToken) =>
        await dbContext.GlobalBlocklist
            .Where(item => item.DomainEtld1 == domainEtld1)
            .ExecuteDeleteAsync(cancellationToken) == 1;

    public async Task<IReadOnlyCollection<GlobalBlockedDomain>> ListBlockedDomainsAsync(
        CancellationToken cancellationToken) =>
        await dbContext.GlobalBlocklist
            .AsNoTracking()
            .OrderBy(item => item.DomainEtld1)
            .ToListAsync(cancellationToken);

    public async Task RecordAuditEntryAsync(
        AdminAuditLogEntry entry,
        CancellationToken cancellationToken)
    {
        dbContext.AdminAuditLog.Add(entry);
        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
