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

    Task<PosternUser?> FindByAdminMfaChallengeAsync(
        string challengeHash,
        string purpose,
        DateTimeOffset now,
        CancellationToken cancellationToken);

    Task<bool> ActivatePendingUserAsync(Guid userId, CancellationToken cancellationToken);

    Task<bool> SetInitialRecoveryKeyHashAsync(
        Guid userId,
        string recoveryKeyHash,
        CancellationToken cancellationToken);

    Task<bool> SetAdminMfaChallengeAsync(
        Guid userId,
        string challengeHash,
        string purpose,
        DateTimeOffset expiresAt,
        CancellationToken cancellationToken);

    Task<bool> SetAdminTotpSecretAsync(
        Guid userId,
        string protectedSecret,
        CancellationToken cancellationToken);

    Task<bool> CompleteAdminTotpEnrollmentAsync(
        Guid userId,
        string challengeHash,
        string protectedSecret,
        long timeStep,
        DateTimeOffset now,
        CancellationToken cancellationToken);

    Task<bool> CompleteAdminMfaLoginAsync(
        Guid userId,
        string challengeHash,
        long timeStep,
        DateTimeOffset now,
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

    Task AddInviteAsync(InviteCode invite, CancellationToken cancellationToken);

    Task<InviteCode> CreateInviteAsync(string email, string emailNormalized, CancellationToken cancellationToken);
}
