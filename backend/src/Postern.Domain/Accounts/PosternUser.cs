using Postern.Domain.Aliases;

namespace Postern.Domain.Accounts;

public sealed class PosternUser
{
    public Guid Id { get; set; }
    public required string Email { get; set; }
    public required string NormalizedEmail { get; set; }
    public required string PasswordHash { get; set; }
    public string? RecoveryKeyHash { get; set; }
    public bool IsAdmin { get; set; }
    public required string Status { get; set; }
    public Guid? InviteCodeUsedId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public ICollection<Alias> Aliases { get; } = new List<Alias>();
}
