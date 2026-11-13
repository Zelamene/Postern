using System.Security.Cryptography;
using System.Text;
using Postern.Application.Aliases;
using Postern.Domain.Activity;
using Postern.Domain.Aliases;

namespace Postern.Application.Activity;

public sealed class IngestService(IActivityRepository activityRepository, TimeProvider timeProvider)
{
    public async Task<IngestResult> IngestAsync(
        IngestRequest request,
        CancellationToken cancellationToken = default) =>
        (await IngestWithOutcomeAsync(request, cancellationToken)).Result;

    public Task<IngestResult> IngestAsync(
        string recipientAddress,
        string envelopeSender,
        string fromHeader,
        string? subject,
        string authenticationResult,
        CancellationToken cancellationToken = default) =>
        IngestAsync(
            new IngestRequest(recipientAddress, envelopeSender, fromHeader, subject, authenticationResult),
            cancellationToken);

    public Task<IngestOutcome> IngestWithOutcomeAsync(
        string recipientAddress,
        string envelopeSender,
        string fromHeader,
        string? subject,
        string authenticationResult,
        CancellationToken cancellationToken = default) =>
        IngestWithOutcomeAsync(
            new IngestRequest(recipientAddress, envelopeSender, fromHeader, subject, authenticationResult),
            cancellationToken);

    public async Task<IngestOutcome> IngestWithOutcomeAsync(
        IngestRequest request,
        CancellationToken cancellationToken = default)
    {
        var recipientAddress = request.RecipientAddress ?? string.Empty;
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

        var decodedSubject = Rfc2047Decoder.Decode(request.Subject);
        var truncatedSubject = TruncateSubject(decodedSubject);

        if (request.Blocked is true)
        {
            return await RecordBlockedAsync(
                alias,
                request.FromHeader,
                truncatedSubject,
                NormalizeReason(request.Reason),
                cancellationToken);
        }

        if (alias.Status is AliasStatus.Deleted or AliasStatus.Replaced or AliasStatus.Disabled)
        {
            return await RecordBlockedAsync(
                alias,
                request.FromHeader,
                truncatedSubject,
                alias.Status.ToString().ToLowerInvariant(),
                cancellationToken);
        }

        if (alias.Status == AliasStatus.Active)
        {
            return await IngestActiveAliasAsync(alias, request, truncatedSubject, cancellationToken);
        }

        return new IngestOutcome(IngestResult.Dropped, alias.Id, alias.UserId);
    }

    private async Task<IngestOutcome> RecordBlockedAsync(
        Alias alias,
        string? fromHeader,
        string? subject,
        string reason,
        CancellationToken cancellationToken)
    {
        var blockedMessage = new BlockedMessage
        {
            Id = Guid.NewGuid(),
            AliasId = alias.Id,
            FromHeader = TruncateHeader(fromHeader ?? string.Empty),
            Subject = subject,
            ReceivedAt = timeProvider.GetUtcNow(),
            Reason = reason
        };

        await activityRepository.RecordBlockedMessageAsync(blockedMessage, cancellationToken);
        return new IngestOutcome(IngestResult.Blocked, alias.Id, alias.UserId);
    }

    private async Task<IngestOutcome> IngestActiveAliasAsync(
        Alias alias,
        IngestRequest request,
        string? truncatedSubject,
        CancellationToken cancellationToken)
    {
        var authResult = NormalizeAuthenticationResult(request.AuthenticationResult);
        var fromHeader = request.FromHeader ?? string.Empty;
        var senderEtld1 = Etld1Normalizer.Normalize(fromHeader);
        var senderAddress = Etld1Normalizer.NormalizeSenderAddress(fromHeader);
        var normalizedMessageId = NormalizeMessageId(request.MessageId);

        if (normalizedMessageId is not null
            && await activityRepository.MessageIdExistsAsync(alias.Id, normalizedMessageId, cancellationToken))
        {
            return new IngestOutcome(IngestResult.Duplicate, alias.Id, alias.UserId);
        }

        var (isFlagged, flagReason) = await EvaluateSenderPolicyAsync(
            alias,
            senderAddress,
            senderEtld1,
            authResult,
            cancellationToken);

        var message = new Message
        {
            Id = Guid.NewGuid(),
            AliasId = alias.Id,
            FromHeader = TruncateHeader(fromHeader),
            EnvelopeSender = (request.EnvelopeSender ?? string.Empty).Trim(),
            MessageId = normalizedMessageId,
            Subject = truncatedSubject,
            ReceivedAt = timeProvider.GetUtcNow(),
            AuthenticationResult = authResult,
            IsFlagged = isFlagged,
            FlagReason = flagReason
        };

        await activityRepository.RecordMessageAsync(message, cancellationToken);
        return new IngestOutcome(IngestResult.Accepted, alias.Id, alias.UserId);
    }

    private async Task<(bool IsFlagged, string? FlagReason)> EvaluateSenderPolicyAsync(
        Alias alias,
        string? senderAddress,
        string? senderEtld1,
        string authResult,
        CancellationToken cancellationToken)
    {
        if (alias.ExpectedSenders is { Count: > 0 })
        {
            if (IsExpectedSender(alias.ExpectedSenders, senderAddress, senderEtld1))
            {
                return (false, null);
            }

            return authResult switch
            {
                "pass" => (true, "unexpected_pass"),
                "none" => (true, "unexpected_none"),
                "fail" => (true, "fail"),
                _ => (true, authResult)
            };
        }

        if (authResult == "pass" && senderAddress is not null && senderEtld1 is not null)
        {
            await activityRepository.AddExpectedAddressSenderAsync(
                alias.Id,
                senderAddress,
                senderEtld1,
                timeProvider.GetUtcNow(),
                cancellationToken);
        }

        var isFlagged = authResult != "pass";
        return (isFlagged, isFlagged ? authResult : null);
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

    private static bool IsExpectedSender(
        IEnumerable<ExpectedSender> senders,
        string? senderAddress,
        string? senderEtld1) =>
        senders.Any(sender =>
            (senderAddress is not null
                && sender.SenderAddress is not null
                && string.Equals(sender.SenderAddress, senderAddress, StringComparison.OrdinalIgnoreCase))
            || (sender.TrustWholeDomain
                && senderEtld1 is not null
                && string.Equals(sender.SenderEtld1, senderEtld1, StringComparison.OrdinalIgnoreCase)));

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
