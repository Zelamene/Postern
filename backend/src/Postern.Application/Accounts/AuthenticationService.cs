using System.Security.Cryptography;
using System.Text;
using Postern.Application.Integrations;
using Postern.Domain.Accounts;

namespace Postern.Application.Accounts;

public sealed class AuthenticationService(
    IAccountRepository accounts,
    IDestinationService destinations,
    IPasswordHashingService passwords,
    TimeProvider timeProvider)
{
    public const int MaximumUsers = 199;
    public const int MinimumPasswordLength = 12;
    public const int MaximumPasswordLength = 128;
    private const int MaximumInviteCodeLength = 128;

    public async Task<RegistrationResult> RegisterAsync(
        string? email,
        string? password,
        string? inviteCode,
        CancellationToken cancellationToken)
    {
        if (!EmailAddressNormalizer.TryNormalize(email, out var normalizedEmail)
            || password is null
            || !IsValidPassword(password))
        {
            return RegistrationResult.InvalidRequest;
        }

        var normalizedIdentity = EmailAddressNormalizer.NormalizeIdentity(normalizedEmail);
        var legacyIdentities = GetLegacyIdentities(email!, normalizedEmail, normalizedIdentity);

        if (string.IsNullOrWhiteSpace(inviteCode)
            || inviteCode.Length > MaximumInviteCodeLength)
        {
            return RegistrationResult.InvalidInvite;
        }

        var now = timeProvider.GetUtcNow();
        var user = new PosternUser
        {
            Id = Guid.NewGuid(),
            Email = normalizedEmail,
            NormalizedEmail = normalizedIdentity,
            ForwardingAddress = normalizedEmail,
            PasswordHash = passwords.HashPassword(password),
            IsAdmin = false,
            Status = "pending",
            CreatedAt = now
        };

        var result = await accounts.RegisterPendingUserAsync(
            user,
            legacyIdentities,
            HashInviteCode(inviteCode),
            MaximumUsers,
            now,
            cancellationToken);

        if (result == RegistrationResult.Created)
        {
            await destinations.AddAsync(normalizedEmail, cancellationToken);
        }

        return result;
    }

    public async Task<(AuthenticationResult Result, AuthenticatedAccount? Account)> LoginAsync(
        string? email,
        string? password,
        CancellationToken cancellationToken)
    {
        if (!EmailAddressNormalizer.TryNormalize(email, out var normalizedEmail)
            || string.IsNullOrEmpty(password))
        {
            return (AuthenticationResult.InvalidCredentials, null);
        }

        var normalizedIdentity = EmailAddressNormalizer.NormalizeIdentity(normalizedEmail);
        var user = await accounts.FindByNormalizedEmailAsync(normalizedIdentity, cancellationToken);
        if (user is null)
        {
            foreach (var legacyIdentity in GetLegacyIdentities(email!, normalizedEmail, normalizedIdentity))
            {
                if (legacyIdentity == normalizedIdentity)
                {
                    continue;
                }

                user = await accounts.FindByNormalizedEmailAsync(legacyIdentity, cancellationToken);
                if (user is not null)
                {
                    break;
                }
            }
        }

        if (user is null
            || !passwords.VerifyPassword(user.PasswordHash, password)
            || (user.Status != "pending" && user.Status != "active"))
        {
            return (AuthenticationResult.InvalidCredentials, null);
        }

        if (user.Status == "pending")
        {
            var forwardingAddress = user.EffectiveForwardingAddress;
            await destinations.AddAsync(forwardingAddress, cancellationToken);
            if (!await destinations.IsVerifiedAsync(forwardingAddress, cancellationToken))
            {
                return (AuthenticationResult.VerificationRequired, null);
            }

            if (!await accounts.ActivatePendingUserAsync(user.Id, cancellationToken))
            {
                return (AuthenticationResult.InvalidCredentials, null);
            }

            user.Status = "active";
        }

        string? recoveryKey = null;
        if (string.IsNullOrEmpty(user.RecoveryKeyHash))
        {
            var generatedKey = GenerateRecoveryKey();
            if (await accounts.SetInitialRecoveryKeyHashAsync(
                    user.Id,
                    generatedKey.Hash,
                    cancellationToken))
            {
                recoveryKey = generatedKey.Value;
            }
        }

        return (
            AuthenticationResult.Authenticated,
            new AuthenticatedAccount(user.Id, user.Email, user.IsAdmin, recoveryKey));
    }

    public async Task<string?> ResetPasswordAsync(
        string? recoveryKey,
        string? newPassword,
        CancellationToken cancellationToken)
    {
        if (recoveryKey is null
            || newPassword is null
            || !IsValidRecoveryKey(recoveryKey)
            || !IsValidPassword(newPassword))
        {
            return null;
        }

        var nextKey = GenerateRecoveryKey();
        var rotated = await accounts.RotateRecoveryCredentialsAsync(
            HashSecret(recoveryKey),
            passwords.HashPassword(newPassword),
            nextKey.Hash,
            cancellationToken);

        return rotated ? nextKey.Value : null;
    }

    public static bool IsValidEmail(string? email) =>
        EmailAddressNormalizer.TryNormalize(email, out _);

    public static bool IsValidPassword(string? password) =>
        password is not null
        && !string.IsNullOrWhiteSpace(password)
        && password.Length >= MinimumPasswordLength
        && password.Length <= MaximumPasswordLength;

    public static string NormalizeEmail(string email) =>
        EmailAddressNormalizer.NormalizeIdentity(email);

    public static string HashInviteCode(string inviteCode) =>
        HashSecret(inviteCode.Trim());

    public static string GenerateUrlSafeToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(18))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

    private static string NormalizeLegacyEmail(string email) => email.Trim().ToUpperInvariant();

    private static IReadOnlyCollection<string> GetLegacyIdentities(
        string originalEmail,
        string normalizedEmail,
        string normalizedIdentity) =>
        new HashSet<string>(StringComparer.Ordinal)
        {
            NormalizeLegacyEmail(originalEmail),
            NormalizeLegacyEmail(normalizedEmail),
            normalizedIdentity.ToUpperInvariant()
        };

    private static bool IsValidRecoveryKey(string? recoveryKey) =>
        recoveryKey is not null
        && recoveryKey.StartsWith("postern_", StringComparison.Ordinal)
        && recoveryKey.Length <= 80;

    private static (string Value, string Hash) GenerateRecoveryKey()
    {
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
        var value = $"postern_{token}";
        return (value, HashSecret(value));
    }

    private static string HashSecret(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
}
