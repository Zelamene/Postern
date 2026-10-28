namespace Postern.Domain.Administration;

public sealed class GlobalBlockedDomain
{
    public required string DomainEtld1 { get; set; }
    public Guid? AddedByAdminUserId { get; set; }
    public required string Reason { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
