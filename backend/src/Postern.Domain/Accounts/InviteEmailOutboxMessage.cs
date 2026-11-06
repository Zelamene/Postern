namespace Postern.Domain.Accounts;

public sealed class InviteEmailOutboxMessage
{
    public Guid Id { get; set; }
    public Guid InviteId { get; set; }
    public required string RecipientEmail { get; set; }
    public required string ProtectedInviteCode { get; set; }
    public required string InviterName { get; set; }
    public DateTimeOffset ExpiresAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset NextAttemptAt { get; set; }
    public DateTimeOffset? LeaseExpiresAt { get; set; }
    public DateTimeOffset? SentAt { get; set; }
    public string Status { get; set; } = "pending";
    public int AttemptCount { get; set; }
    public string? LastError { get; set; }
    public string? ProviderMessageId { get; set; }
}
