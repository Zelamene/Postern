namespace Postern.Domain.Accounts;

public sealed class InviteRequest
{
    public Guid Id { get; set; }
    public required string Email { get; set; }
    public required string EmailNormalized { get; set; }
    public DateTimeOffset RequestedAt { get; set; }
    public string Status { get; set; } = "pending";
    public DateTimeOffset? ReviewedAt { get; set; }
    public Guid? ReviewedByUserId { get; set; }
    public Guid? InviteId { get; set; }
}
