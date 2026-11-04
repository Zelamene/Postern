using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Postern.Api.Security;

public sealed class ResendWebhookSignatureVerifier(IConfiguration configuration, TimeProvider timeProvider)
{
    private static readonly TimeSpan AllowedClockSkew = TimeSpan.FromMinutes(5);

    public bool IsValid(
        string? webhookId,
        string? timestamp,
        string? signatures,
        string body)
    {
        var secret = configuration["Resend:WebhookSecret"] ?? configuration["RESEND_WEBHOOK_SECRET"];
        if (string.IsNullOrWhiteSpace(secret)
            || string.IsNullOrWhiteSpace(webhookId)
            || string.IsNullOrWhiteSpace(timestamp)
            || string.IsNullOrWhiteSpace(signatures)
            || !long.TryParse(timestamp, NumberStyles.None, CultureInfo.InvariantCulture, out var unixTimestamp))
        {
            return false;
        }

        DateTimeOffset signedAt;
        try
        {
            signedAt = DateTimeOffset.FromUnixTimeSeconds(unixTimestamp);
        }
        catch (ArgumentOutOfRangeException)
        {
            return false;
        }

        if ((timeProvider.GetUtcNow() - signedAt).Duration() > AllowedClockSkew)
        {
            return false;
        }

        byte[] key;
        try
        {
            var encodedSecret = secret.StartsWith("whsec_", StringComparison.Ordinal)
                ? secret["whsec_".Length..]
                : secret;
            key = Convert.FromBase64String(encodedSecret);
        }
        catch (FormatException)
        {
            return false;
        }

        var signedPayload = Encoding.UTF8.GetBytes($"{webhookId}.{timestamp}.{body}");
        var expected = HMACSHA256.HashData(key, signedPayload);
        foreach (var signature in signatures.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            var separator = signature.IndexOf(',');
            if (separator <= 0 || !signature.AsSpan(0, separator).SequenceEqual("v1"))
            {
                continue;
            }

            try
            {
                var provided = Convert.FromBase64String(signature[(separator + 1)..]);
                if (provided.Length == expected.Length
                    && CryptographicOperations.FixedTimeEquals(provided, expected))
                {
                    return true;
                }
            }
            catch (FormatException)
            {
                continue;
            }
        }

        return false;
    }
}
