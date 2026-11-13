namespace Postern.Domain.Aliases;

public sealed class ExpectedSender
{
    public Guid Id { get; set; }
    public Guid AliasId { get; set; }
    public required string SenderEtld1 { get; set; }

    /// <summary>Full sender address for address-scoped trust; null for domain-scoped rows.</summary>
    public string? SenderAddress { get; set; }

    /// <summary>True when trust covers every address at <see cref="SenderEtld1"/>.</summary>
    public bool TrustWholeDomain { get; set; }

    public bool IsBlocked { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public Alias Alias { get; set; } = null!;
}
