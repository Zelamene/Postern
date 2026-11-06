using System.Security.Cryptography;
using System.Text;
using Postern.Application.Aliases;
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
        CancellationToken cancellationToken,
        bool blocked = false,
        string? reason = null,
        string? messageId = null) =>
        (await IngestWithOutcomeAsync(
            recipientAddress,
            envelopeSender,
            fromHeader,
            subject,
            authenticationResult,
            cancellationToken,
            blocked,
            reason,
            messageId)).Result;

    public async Task<IngestOutcome> IngestWithOutcomeAsync(
        string recipientAddress,
        string envelopeSender,
        string fromHeader,
        string? subject,
        string authenticationResult,
        CancellationToken cancellationToken,
        bool blocked = false,
        string? reason = null,
        string? messageId = null)
    {
        if (string.IsNullOrWhiteSpace(recipientAddress))
        {
            return new IngestOutcome(IngestResult.Dropped);
        }

        var hash = HashAddress(recipientAddress.Trim().ToLowerInvariant());

        var alias = await activityRepository.FindAliasForIngestWithExpectedSendersAsync(hash, cancellationToken);
        if (alias is null)
        {
            return new IngestOutcome(IngestResult.UnknownAlias);
        }

        var decodedSubject = Rfc2047Decoder.Decode(subject);
        var truncatedSubject = TruncateSubject(decodedSubject);

        if (blocked)
        {
            var blockedMessage = new BlockedMessage
            {
                Id = Guid.NewGuid(),
                AliasId = alias.Id,
                FromHeader = TruncateHeader(fromHeader),
                Subject = truncatedSubject,
                ReceivedAt = timeProvider.GetUtcNow(),
                Reason = NormalizeReason(reason)
            };

            await activityRepository.RecordBlockedMessageAsync(blockedMessage, cancellationToken);
            return new IngestOutcome(IngestResult.Blocked, alias.Id, alias.UserId);
        }

        if (alias.Status == AliasStatus.Deleted || alias.Status == AliasStatus.Replaced || alias.Status == AliasStatus.Disabled)
        {
            var statusBlocked = new BlockedMessage
            {
                Id = Guid.NewGuid(),
                AliasId = alias.Id,
                FromHeader = TruncateHeader(fromHeader),
                Subject = truncatedSubject,
                ReceivedAt = timeProvider.GetUtcNow(),
                Reason = alias.Status.ToString().ToLowerInvariant()
            };

            await activityRepository.RecordBlockedMessageAsync(statusBlocked, cancellationToken);
            return new IngestOutcome(IngestResult.Blocked, alias.Id, alias.UserId);
        }

        if (alias.Status == AliasStatus.Active)
        {
            var authResult = NormalizeAuthenticationResult(authenticationResult);
            var senderEtld1 = Etld1Normalizer.Normalize(fromHeader);
            var normalizedMessageId = NormalizeMessageId(messageId);

            if (normalizedMessageId is not null
                && await activityRepository.MessageIdExistsAsync(alias.Id, normalizedMessageId, cancellationToken))
            {
                return new IngestOutcome(IngestResult.Duplicate, alias.Id, alias.UserId);
            }

            if (alias.ExpectedSenders is not null && alias.ExpectedSenders.Count > 0)
            {
                var hasExpected = senderEtld1 is not null && alias.ExpectedSenders.Any(expected => string.Equals(expected.SenderEtld1, senderEtld1, StringComparison.OrdinalIgnoreCase));
                if (hasExpected)
                {
                    var expectedMessage = new Message
                    {
                        Id = Guid.NewGuid(),
                        AliasId = alias.Id,
                        FromHeader = TruncateHeader(fromHeader),
                        EnvelopeSender = envelopeSender.Trim(),
                        MessageId = normalizedMessageId,
                        Subject = truncatedSubject,
                        ReceivedAt = timeProvider.GetUtcNow(),
                        AuthenticationResult = authResult,
                        IsFlagged = false,
                        FlagReason = null
                    };

                    await activityRepository.RecordMessageAsync(expectedMessage, cancellationToken);
                    return new IngestOutcome(IngestResult.Accepted, alias.Id, alias.UserId);
                }

                if (authResult == "pass")
                {
                    var flaggedMessagePass = new Message
                    {
                        Id = Guid.NewGuid(),
                        AliasId = alias.Id,
                        FromHeader = TruncateHeader(fromHeader),
                        EnvelopeSender = envelopeSender.Trim(),
                        MessageId = normalizedMessageId,
                        Subject = truncatedSubject,
                        ReceivedAt = timeProvider.GetUtcNow(),
                        AuthenticationResult = authResult,
                        IsFlagged = true,
                        FlagReason = "unexpected_pass"
                    };

                    await activityRepository.RecordMessageAsync(flaggedMessagePass, cancellationToken);
                    return new IngestOutcome(IngestResult.Accepted, alias.Id, alias.UserId);
                }

                if (authResult == "none")
                {
                    var flaggedMessageNone = new Message
                    {
                        Id = Guid.NewGuid(),
                        AliasId = alias.Id,
                        FromHeader = TruncateHeader(fromHeader),
                        EnvelopeSender = envelopeSender.Trim(),
                        MessageId = normalizedMessageId,
                        Subject = truncatedSubject,
                        ReceivedAt = timeProvider.GetUtcNow(),
                        AuthenticationResult = authResult,
                        IsFlagged = true,
                        FlagReason = "unexpected_none"
                    };

                    await activityRepository.RecordMessageAsync(flaggedMessageNone, cancellationToken);
                    return new IngestOutcome(IngestResult.Accepted, alias.Id, alias.UserId);
                }

                if (authResult == "fail")
                {
                    var flaggedMessageFail = new Message
                    {
                        Id = Guid.NewGuid(),
                        AliasId = alias.Id,
                        FromHeader = TruncateHeader(fromHeader),
                        EnvelopeSender = envelopeSender.Trim(),
                        MessageId = normalizedMessageId,
                        Subject = truncatedSubject,
                        ReceivedAt = timeProvider.GetUtcNow(),
                        AuthenticationResult = authResult,
                        IsFlagged = true,
                        FlagReason = "fail"
                    };

                    await activityRepository.RecordMessageAsync(flaggedMessageFail, cancellationToken);
                    return new IngestOutcome(IngestResult.Accepted, alias.Id, alias.UserId);
                }
            }
            else
            {
                if (authResult == "pass" && senderEtld1 is not null)
                {
                    await activityRepository.AddExpectedSenderAsync(alias.Id, senderEtld1, timeProvider.GetUtcNow(), cancellationToken);
                }
            }

            var finalMessage = new Message
            {
                Id = Guid.NewGuid(),
                AliasId = alias.Id,
                FromHeader = TruncateHeader(fromHeader),
                EnvelopeSender = envelopeSender.Trim(),
                MessageId = normalizedMessageId,
                Subject = truncatedSubject,
                ReceivedAt = timeProvider.GetUtcNow(),
                AuthenticationResult = authResult,
                IsFlagged = authResult != "pass",
                FlagReason = authResult != "pass" ? authResult : null
            };

            await activityRepository.RecordMessageAsync(finalMessage, cancellationToken);
            return new IngestOutcome(IngestResult.Accepted, alias.Id, alias.UserId);
        }

        return new IngestOutcome(IngestResult.Dropped, alias.Id, alias.UserId);
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

    private static string? NormalizeMessageId(string? messageId)
    {
        if (string.IsNullOrWhiteSpace(messageId))
        {
            return null;
        }

        var trimmed = messageId.Trim();
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

    private static string NormalizeReason(string? reason)
    {
        if (string.IsNullOrWhiteSpace(reason))
        {
            return "blocked";
        }

        var trimmed = reason.Trim();
        return trimmed.Length > 32 ? trimmed[..32] : trimmed;
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
