namespace Postern.Domain.Aliases;

public sealed class ExpectedSender
{
    public Guid Id { get; set; }
    public Guid AliasId { get; set; }
    public required string SenderEtld1 { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public Alias Alias { get; set; } = null!;
}
