using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;
using Postern.Application.Accounts;
using Postern.Domain.Accounts;
using Postern.Infrastructure.Persistence;

namespace Postern.Infrastructure.Accounts;

public sealed class EfAccountRepository(PosternDbContext dbContext) : IAccountRepository
{
    private const long RegistrationLockId = 7243910081;

    public async Task<RegistrationResult> RegisterPendingUserAsync(
        PosternUser user,
        IReadOnlyCollection<string> legacyNormalizedEmails,
        string inviteCodeHash,
        int maximumUsers,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        await dbContext.Database.ExecuteSqlRawAsync(
            $"SELECT pg_advisory_xact_lock({RegistrationLockId})",
            cancellationToken);

        var invite = await dbContext.InviteCodes
            .SingleOrDefaultAsync(
                item => item.CodeHash == inviteCodeHash
                    && item.UsedAt == null
                    && (item.ExpiresAt == null || item.ExpiresAt > now),
                cancellationToken);
        if (invite is null)
        {
            return RegistrationResult.InvalidInvite;
        }

        if (await dbContext.Users.AnyAsync(
                item => item.NormalizedEmail == user.NormalizedEmail
                    || legacyNormalizedEmails.Contains(item.NormalizedEmail),
                cancellationToken))
        {
            return RegistrationResult.EmailAlreadyRegistered;
        }

        if (await dbContext.Users.CountAsync(cancellationToken) >= maximumUsers)
        {
            return RegistrationResult.UserLimitReached;
        }

        user.InviteCodeUsedId = invite.Id;
        invite.UsedAt = now;
        invite.UsedByUserId = user.Id;
        dbContext.Users.Add(user);

        try
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException exception) when (IsDuplicateEmail(exception))
        {
            return RegistrationResult.EmailAlreadyRegistered;
        }

        await transaction.CommitAsync(cancellationToken);
        return RegistrationResult.Created;
    }

    public Task<PosternUser?> FindByNormalizedEmailAsync(
        string normalizedEmail,
        CancellationToken cancellationToken) =>
        dbContext.Users.SingleOrDefaultAsync(
            user => user.NormalizedEmail == normalizedEmail,
            cancellationToken);

    public async Task<bool> ActivatePendingUserAsync(Guid userId, CancellationToken cancellationToken) =>
        await dbContext.Users
            .Where(user => user.Id == userId && user.Status == "pending")
            .ExecuteUpdateAsync(
                setters => setters.SetProperty(user => user.Status, "active"),
                cancellationToken) == 1;

    public async Task<bool> SetInitialRecoveryKeyHashAsync(
        Guid userId,
        string recoveryKeyHash,
        CancellationToken cancellationToken) =>
        await dbContext.Users
            .Where(user =>
                user.Id == userId
                && user.Status == "active"
                && user.RecoveryKeyHash == null)
            .ExecuteUpdateAsync(
                setters => setters.SetProperty(user => user.RecoveryKeyHash, recoveryKeyHash),
                cancellationToken) == 1;

    public async Task<bool> RotateRecoveryCredentialsAsync(
        string currentRecoveryKeyHash,
        string passwordHash,
        string nextRecoveryKeyHash,
        CancellationToken cancellationToken) =>
        await dbContext.Users
            .Where(user =>
                user.Status == "active"
                && user.RecoveryKeyHash == currentRecoveryKeyHash)
            .ExecuteUpdateAsync(
                setters => setters
                    .SetProperty(user => user.PasswordHash, passwordHash)
                    .SetProperty(user => user.RecoveryKeyHash, nextRecoveryKeyHash),
                cancellationToken) == 1;

    private static bool IsDuplicateEmail(DbUpdateException exception) =>
        exception.InnerException is PostgresException
        {
            SqlState: PostgresErrorCodes.UniqueViolation,
            ConstraintName: "ux_users_normalized_email"
        };
}
