namespace Postern.Domain.Accounts;

public sealed class ResendWebhookEvent
{
    public required string Id { get; set; }
    public required string EventType { get; set; }
    public string? ProviderMessageId { get; set; }
    public DateTimeOffset ReceivedAt { get; set; }
}
