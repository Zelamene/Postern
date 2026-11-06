using Postern.Domain.Aliases;

namespace Postern.Domain.Activity;

public sealed class Message
{
    public Guid Id { get; set; }
    public Guid AliasId { get; set; }
    public required string FromHeader { get; set; }
    public required string EnvelopeSender { get; set; }
    public string? MessageId { get; set; }
    public string? Subject { get; set; }
    public DateTimeOffset ReceivedAt { get; set; }
    public required string AuthenticationResult { get; set; }
    public bool IsFlagged { get; set; }
    public string? FlagReason { get; set; }
    public Alias Alias { get; set; } = null!;
}
