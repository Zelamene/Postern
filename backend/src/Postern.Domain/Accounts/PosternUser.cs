using Postern.Domain.Aliases;

namespace Postern.Domain.Accounts;

public sealed class PosternUser
{
    public Guid Id { get; set; }

    /// <summary>Login identity. Never mutated after registration.</summary>
    public required string Email { get; set; }

    /// <summary>Login identity, normalized for lookup. Never mutated after registration.</summary>
    public required string NormalizedEmail { get; set; }

    /// <summary>Verified Cloudflare destination address. Null until set explicitly.</summary>
    public string? ForwardingAddress { get; set; }

    /// <summary>Address mail is actually forwarded to.</summary>
    public string EffectiveForwardingAddress => ForwardingAddress ?? Email;
    public required string PasswordHash { get; set; }
    public string? RecoveryKeyHash { get; set; }
    public bool IsAdmin { get; set; }
    public string? AdminTotpSecretProtected { get; set; }
    public DateTimeOffset? AdminTotpEnabledAt { get; set; }
    public long? AdminTotpLastUsedStep { get; set; }
    public string? AdminMfaChallengeHash { get; set; }
    public string? AdminMfaChallengePurpose { get; set; }
    public DateTimeOffset? AdminMfaChallengeExpiresAt { get; set; }
    public required string Status { get; set; }
    public Guid? InviteCodeUsedId { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public ICollection<Alias> Aliases { get; } = new List<Alias>();
}
