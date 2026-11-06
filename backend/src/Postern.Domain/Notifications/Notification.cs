namespace Postern.Domain.Notifications;

public sealed class Notification
{
    public Guid Id { get; set; }
    public required NotificationAudience Audience { get; set; }
    public Guid? RecipientUserId { get; set; }
    public required string Kind { get; set; }
    public required string Title { get; set; }
    public string? Body { get; set; }
    public string? Link { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? ReadAt { get; set; }
}
