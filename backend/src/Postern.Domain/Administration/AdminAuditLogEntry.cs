namespace Postern.Domain.Administration;

public sealed class AdminAuditLogEntry
{
    public Guid Id { get; set; }
    public Guid? AdminUserId { get; set; }
    public required string Action { get; set; }
    public string? TargetId { get; set; }
    public string? Metadata { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
