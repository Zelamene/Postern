using Postern.Domain.Accounts;
using Postern.Domain.Activity;

namespace Postern.Domain.Aliases;

public sealed class Alias
{
    public Guid Id { get; set; }
    public Guid? UserId { get; set; }
    public string? Label { get; set; }
    public string? RandomSuffix { get; set; }
    public string? FullAddress { get; set; }
    public required string FullAddressHash { get; set; }
    public string? PurposeMetadata { get; set; }
    public string? Category { get; set; }
    public required AliasStatus Status { get; set; }
    public Guid? ReplacedByAliasId { get; set; }
    public bool KvDirty { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }
    public PosternUser? User { get; set; }
    public ICollection<Message> Messages { get; } = new List<Message>();
    public ICollection<ExpectedSender> ExpectedSenders { get; } = new List<ExpectedSender>();
    public ICollection<BlockedMessage> BlockedMessages { get; } = new List<BlockedMessage>();
}
