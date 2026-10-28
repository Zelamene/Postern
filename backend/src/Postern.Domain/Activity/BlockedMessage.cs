using Postern.Domain.Aliases;

namespace Postern.Domain.Activity;

public sealed class BlockedMessage
{
    public Guid Id { get; set; }
    public Guid AliasId { get; set; }
    public required string FromHeader { get; set; }
    public string? Subject { get; set; }
    public DateTimeOffset ReceivedAt { get; set; }
    public required string Reason { get; set; }
    public Alias Alias { get; set; } = null!;
}
