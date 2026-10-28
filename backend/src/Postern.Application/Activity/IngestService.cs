using System.Security.Cryptography;
using System.Text;
using Postern.Domain.Activity;
using Postern.Domain.Aliases;

namespace Postern.Application.Activity;

public sealed class IngestService(IActivityRepository activityRepository, TimeProvider timeProvider)
{
    public async Task<IngestResult> IngestAsync(
        string recipientAddress,
        string envelopeSender,
        string fromHeader,
        string? subject,
        string authenticationResult,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(recipientAddress))
        {
            return IngestResult.Dropped;
        }

        var hash = HashAddress(recipientAddress.Trim().ToLowerInvariant());

        var alias = await activityRepository.FindAliasForIngestAsync(hash, cancellationToken);
        if (alias is null)
        {
            return IngestResult.UnknownAlias;
        }

        if (alias.Status == AliasStatus.Deleted || alias.Status == AliasStatus.Replaced || alias.Status == AliasStatus.Disabled)
        {
            var blocked = new BlockedMessage
            {
                Id = Guid.NewGuid(),
                AliasId = alias.Id,
                FromHeader = TruncateHeader(fromHeader),
                Subject = TruncateSubject(subject),
                ReceivedAt = timeProvider.GetUtcNow(),
                Reason = alias.Status.ToString().ToLowerInvariant()
            };

            await activityRepository.RecordBlockedMessageAsync(blocked, cancellationToken);
            return IngestResult.Blocked;
        }

        if (alias.Status == AliasStatus.Active)
        {
            var message = new Message
            {
                Id = Guid.NewGuid(),
                AliasId = alias.Id,
                FromHeader = TruncateHeader(fromHeader),
                EnvelopeSender = envelopeSender.Trim(),
                Subject = TruncateSubject(subject),
                ReceivedAt = timeProvider.GetUtcNow(),
                AuthenticationResult = NormalizeAuthenticationResult(authenticationResult),
                IsFlagged = false,
                FlagReason = null
            };

            await activityRepository.RecordMessageAsync(message, cancellationToken);
            return IngestResult.Accepted;
        }

        return IngestResult.Dropped;
    }

    private static string HashAddress(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    private static string TruncateHeader(string header)
    {
        if (string.IsNullOrWhiteSpace(header))
        {
            return string.Empty;
        }

        var trimmed = header.Trim();
        return trimmed.Length > 998 ? trimmed[..998] : trimmed;
    }

    private static string? TruncateSubject(string? subject)
    {
        if (string.IsNullOrWhiteSpace(subject))
        {
            return null;
        }

        var trimmed = subject.Trim();
        if (trimmed.Length == 0)
        {
            return null;
        }

        return trimmed.Length > 60 ? trimmed[..60] : trimmed;
    }

    private static string NormalizeAuthenticationResult(string? authenticationResult)
    {
        if (string.IsNullOrWhiteSpace(authenticationResult))
        {
            return "unknown";
        }

        var normalized = authenticationResult.Trim().ToLowerInvariant();
        return normalized == "pass" || normalized == "none" || normalized == "fail" ? normalized : "unknown";
    }
}
