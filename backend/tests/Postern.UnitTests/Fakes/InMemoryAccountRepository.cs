using Postern.Application.Accounts;
using Postern.Domain.Accounts;

namespace Postern.UnitTests.Fakes;

public sealed class InMemoryAccountRepository : IAccountRepository
{
    private readonly Dictionary<Guid, PosternUser> _users = new();
    private readonly Dictionary<string, InviteCode> _invites = new(StringComparer.Ordinal);

    public IReadOnlyCollection<InviteCode> Invites => _invites.Values;

    public string DefaultForwardingAddress { get; set; } = "inbox@example.test";

    public bool AutoCreateUsers { get; set; } = true;

    public IReadOnlyCollection<PosternUser> Users => _users.Values;

    public void Add(PosternUser user) => _users[user.Id] = user;

    public Task<PosternUser?> FindByIdAsync(Guid userId, CancellationToken cancellationToken) =>
        Task.FromResult(Find(userId));

    public Task<PosternUser?> FindByNormalizedEmailAsync(
        string normalizedEmail,
        CancellationToken cancellationToken) =>
        Task.FromResult(_users.Values.FirstOrDefault(user => user.NormalizedEmail == normalizedEmail));

    public Task<RegistrationResult> RegisterPendingUserAsync(
        PosternUser user,
        IReadOnlyCollection<string> legacyNormalizedEmails,
        string inviteCodeHash,
        int maximumUsers,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        _users[user.Id] = user;
        return Task.FromResult(RegistrationResult.Created);
    }

    public Task<bool> ActivatePendingUserAsync(Guid userId, CancellationToken cancellationToken)
    {
        var user = Find(userId);
        if (user is null)
        {
            return Task.FromResult(false);
        }

        user.Status = "active";
        return Task.FromResult(true);
    }

    public Task<bool> SetInitialRecoveryKeyHashAsync(
        Guid userId,
        string recoveryKeyHash,
        CancellationToken cancellationToken)
    {
        var user = Find(userId);
        if (user is null)
        {
            return Task.FromResult(false);
        }

        user.RecoveryKeyHash = recoveryKeyHash;
        return Task.FromResult(true);
    }

    public Task<bool> RotateRecoveryCredentialsAsync(
        string currentRecoveryKeyHash,
        string passwordHash,
        string nextRecoveryKeyHash,
        CancellationToken cancellationToken)
    {
        var user = _users.Values.FirstOrDefault(item => item.RecoveryKeyHash == currentRecoveryKeyHash);
        if (user is null)
        {
            return Task.FromResult(false);
        }

        user.PasswordHash = passwordHash;
        user.RecoveryKeyHash = nextRecoveryKeyHash;
        return Task.FromResult(true);
    }

    public Task<bool> UpdateForwardingAddressAsync(
        Guid userId,
        string newForwardingAddress,
        CancellationToken cancellationToken)
    {
        var user = Find(userId);
        if (user is null)
        {
            return Task.FromResult(false);
        }

        user.ForwardingAddress = newForwardingAddress;
        return Task.FromResult(true);
    }

    public Task<bool> DeleteAccountAsync(
        Guid userId,
        DateTimeOffset deletedAt,
        CancellationToken cancellationToken) =>
        Task.FromResult(_users.Remove(userId));

    public Task<IReadOnlyCollection<Guid>> ListSuspendedUserIdsAsync(CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyCollection<Guid>>(
            _users.Values
                .Where(user => user.Status == "suspended")
                .Select(user => user.Id)
                .ToList());

    public Task AddInviteAsync(InviteCode invite, CancellationToken cancellationToken)
    {
        _invites[invite.CodeHash] = invite;
        return Task.CompletedTask;
    }

    public Task<InviteCode> CreateInviteAsync(
        string email,
        string emailNormalized,
        CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var invite = new InviteCode
        {
            Id = Guid.NewGuid(),
            CodeHash = AuthenticationService.HashInviteCode(
                $"postern_invite_{AuthenticationService.GenerateUrlSafeToken()}"),
            Email = email,
            EmailNormalized = emailNormalized,
            CreatedAt = now,
            ExpiresAt = now.AddDays(7)
        };
        _invites[invite.CodeHash] = invite;
        return Task.FromResult(invite);
    }

    public Task<bool> SetStatusAsync(Guid userId, string status, CancellationToken cancellationToken)
    {
        var user = Find(userId);
        if (user is null)
        {
            return Task.FromResult(false);
        }

        user.Status = status;
        return Task.FromResult(true);
    }

    private PosternUser? Find(Guid userId)
    {
        if (_users.TryGetValue(userId, out var existing))
        {
            return existing;
        }

        if (!AutoCreateUsers)
        {
            return null;
        }

        var created = new PosternUser
        {
            Id = userId,
            Email = $"owner-{userId:N}@example.test",
            NormalizedEmail = $"OWNER-{userId:N}@EXAMPLE.TEST",
            ForwardingAddress = DefaultForwardingAddress,
            PasswordHash = "hash",
            Status = "active",
            CreatedAt = DateTimeOffset.UtcNow
        };

        _users[userId] = created;
        return created;
    }
}
