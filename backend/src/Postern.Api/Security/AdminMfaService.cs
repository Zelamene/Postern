using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.DataProtection;
using Postern.Application.Accounts;
using Postern.Domain.Accounts;

namespace Postern.Api.Security;

public sealed class AdminMfaService(
    IAccountRepository accounts,
    IDataProtectionProvider protectionProvider,
    TimeProvider timeProvider)
{
    public static readonly TimeSpan ChallengeLifetime = TimeSpan.FromMinutes(5);
    private const int TimeStepSeconds = 30;
    private const int CodeLength = 6;
    private const string Issuer = "Postern";
    private readonly IDataProtector _secretProtector =
        protectionProvider.CreateProtector("Postern.AdminMfa.TotpSecret.v1");

    public async Task<string?> CreateChallengeAsync(
        Guid userId,
        string purpose,
        CancellationToken cancellationToken)
    {
        if (purpose is not ("setup" or "login"))
        {
            throw new ArgumentOutOfRangeException(nameof(purpose));
        }

        var user = await accounts.FindByIdAsync(userId, cancellationToken);
        if (user is null
            || !user.IsAdmin
            || user.Status != "active"
            || (purpose == "setup" && user.AdminTotpEnabledAt is not null)
            || (purpose == "login" && user.AdminTotpEnabledAt is null))
        {
            return null;
        }

        var token = GenerateToken();
        var now = timeProvider.GetUtcNow();
        return await accounts.SetAdminMfaChallengeAsync(
            userId,
            Hash(token),
            purpose,
            now.Add(ChallengeLifetime),
            cancellationToken)
            ? token
            : null;
    }

    public async Task<AdminTotpSetup?> GetSetupAsync(
        string? challengeToken,
        CancellationToken cancellationToken)
    {
        var challengeUser = await FindChallengeAsync(challengeToken, "setup", cancellationToken);
        if (challengeUser is null)
        {
            return null;
        }

        var protectedSecret = challengeUser.AdminTotpSecretProtected;
        if (protectedSecret is null)
        {
            var secret = GenerateSecret(20);
            protectedSecret = _secretProtector.Protect(secret);
            if (!await accounts.SetAdminTotpSecretAsync(challengeUser.Id, protectedSecret, cancellationToken))
            {
                var refreshedUser = await FindChallengeAsync(challengeToken, "setup", cancellationToken);
                if (refreshedUser?.AdminTotpSecretProtected is not { } refreshedSecret)
                {
                    return null;
                }

                challengeUser = refreshedUser;
                protectedSecret = refreshedSecret;
            }
        }

        var plainSecret = _secretProtector.Unprotect(protectedSecret);
        var encodedSecret = Base32Encode(Convert.FromBase64String(plainSecret));
        var label = Uri.EscapeDataString($"{Issuer}:{challengeUser.Email}");
        var issuer = Uri.EscapeDataString(Issuer);
        var uri = $"otpauth://totp/{label}?secret={encodedSecret}&issuer={issuer}&algorithm=SHA1&digits=6&period=30";
        return new AdminTotpSetup(encodedSecret, uri);
    }

    public async Task<PosternUser?> CompleteEnrollmentAsync(
        string? challengeToken,
        string? code,
        CancellationToken cancellationToken)
    {
        var user = await FindChallengeAsync(challengeToken, "setup", cancellationToken);
        var now = timeProvider.GetUtcNow();
        if (user?.AdminTotpSecretProtected is not { } protectedSecret
            || !TryVerifyCode(_secretProtector.Unprotect(protectedSecret), code, now, out var timeStep))
        {
            return null;
        }

        var completed = await accounts.CompleteAdminTotpEnrollmentAsync(
            user.Id,
            Hash(challengeToken!),
            protectedSecret,
            timeStep,
            now,
            cancellationToken);
        return completed ? user : null;
    }

    public async Task<PosternUser?> CompleteLoginAsync(
        string? challengeToken,
        string? code,
        CancellationToken cancellationToken)
    {
        var user = await FindChallengeAsync(challengeToken, "login", cancellationToken);
        var now = timeProvider.GetUtcNow();
        if (user?.AdminTotpSecretProtected is not { } protectedSecret
            || !TryVerifyCode(_secretProtector.Unprotect(protectedSecret), code, now, out var timeStep))
        {
            return null;
        }

        var completed = await accounts.CompleteAdminMfaLoginAsync(
            user.Id,
            Hash(challengeToken!),
            timeStep,
            now,
            cancellationToken);
        return completed ? user : null;
    }

    private async Task<PosternUser?> FindChallengeAsync(
        string? challengeToken,
        string purpose,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(challengeToken) || challengeToken.Length > 64)
        {
            return null;
        }

        var user = await accounts.FindByAdminMfaChallengeAsync(
            Hash(challengeToken),
            purpose,
            timeProvider.GetUtcNow(),
            cancellationToken);
        return user is { IsAdmin: true, Status: "active" } ? user : null;
    }

    private static bool TryVerifyCode(
        string secret,
        string? code,
        DateTimeOffset now,
        out long matchedTimeStep)
    {
        matchedTimeStep = 0;
        if (code is null || code.Length != CodeLength || code.Any(character => character is < '0' or > '9'))
        {
            return false;
        }

        var currentStep = now.ToUnixTimeSeconds() / TimeStepSeconds;
        var expectedBytes = Encoding.ASCII.GetBytes(code);
        var secretBytes = Convert.FromBase64String(secret);
        for (var offset = -1; offset <= 1; offset++)
        {
            var candidateStep = currentStep + offset;
            if (candidateStep < 0)
            {
                continue;
            }

            var candidate = Encoding.ASCII.GetBytes(CreateCode(secretBytes, candidateStep));
            if (CryptographicOperations.FixedTimeEquals(candidate, expectedBytes))
            {
                matchedTimeStep = candidateStep;
                return true;
            }
        }

        return false;
    }

    private static string CreateCode(byte[] secret, long timeStep)
    {
        Span<byte> counter = stackalloc byte[sizeof(long)];
        System.Buffers.Binary.BinaryPrimitives.WriteInt64BigEndian(counter, timeStep);
        var hash = HMACSHA1.HashData(secret, counter);
        var offset = hash[^1] & 0x0f;
        var binaryCode = ((hash[offset] & 0x7f) << 24)
            | ((hash[offset + 1] & 0xff) << 16)
            | ((hash[offset + 2] & 0xff) << 8)
            | (hash[offset + 3] & 0xff);
        return (binaryCode % 1_000_000).ToString("D6", System.Globalization.CultureInfo.InvariantCulture);
    }

    private static string GenerateSecret(int byteCount) =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(byteCount));

    private static string GenerateToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');

    private static string Hash(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    private static string Base32Encode(ReadOnlySpan<byte> data)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        var result = new StringBuilder((data.Length * 8 + 4) / 5);
        var buffer = 0;
        var bitsLeft = 0;
        foreach (var value in data)
        {
            buffer = (buffer << 8) | value;
            bitsLeft += 8;
            while (bitsLeft >= 5)
            {
                result.Append(alphabet[(buffer >> (bitsLeft - 5)) & 31]);
                bitsLeft -= 5;
            }
        }

        if (bitsLeft > 0)
        {
            result.Append(alphabet[(buffer << (5 - bitsLeft)) & 31]);
        }

        return result.ToString();
    }
}

public sealed record AdminTotpSetup(string Secret, string AuthenticatorUri);
