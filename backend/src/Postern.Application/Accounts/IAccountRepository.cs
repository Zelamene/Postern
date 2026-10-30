using Postern.Domain.Accounts;

namespace Postern.Application.Accounts;

public interface IAccountRepository
{
    Task<RegistrationResult> RegisterPendingUserAsync(
        PosternUser user,
        IReadOnlyCollection<string> legacyNormalizedEmails,
        string inviteCodeHash,
        int maximumUsers,
        DateTimeOffset now,
        CancellationToken cancellationToken);

    Task<PosternUser?> FindByNormalizedEmailAsync(
        string normalizedEmail,
        CancellationToken cancellationToken);

    Task<PosternUser?> FindByIdAsync(
        Guid userId,
        CancellationToken cancellationToken);

    Task<bool> ActivatePendingUserAsync(Guid userId, CancellationToken cancellationToken);

    Task<bool> SetInitialRecoveryKeyHashAsync(
        Guid userId,
        string recoveryKeyHash,
        CancellationToken cancellationToken);

    Task<bool> RotateRecoveryCredentialsAsync(
        string currentRecoveryKeyHash,
        string passwordHash,
        string nextRecoveryKeyHash,
        CancellationToken cancellationToken);

    Task<bool> UpdateForwardingAddressAsync(
        Guid userId,
        string newForwardingAddress,
        CancellationToken cancellationToken);

    Task<bool> DeleteAccountAsync(
        Guid userId,
        DateTimeOffset deletedAt,
        CancellationToken cancellationToken);

    Task<IReadOnlyCollection<Guid>> ListSuspendedUserIdsAsync(CancellationToken cancellationToken);

    Task<bool> SetStatusAsync(Guid userId, string status, CancellationToken cancellationToken);
}
