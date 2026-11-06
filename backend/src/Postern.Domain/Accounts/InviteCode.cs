namespace Postern.Domain.Accounts;

public sealed class InviteCode
{
    public Guid Id { get; set; }
    public required string CodeHash { get; set; }
    public required string Email { get; set; }
    public required string EmailNormalized { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }
    public DateTimeOffset? UsedAt { get; set; }
    public Guid? UsedByUserId { get; set; }
    public string DeliveryStatus { get; set; } = InviteDeliveryStatus.Pending;
    public string? DeliveryMessageId { get; set; }
    public DateTimeOffset? DeliveryUpdatedAt { get; set; }
    public DateTimeOffset? RevokedAt { get; set; }
}
