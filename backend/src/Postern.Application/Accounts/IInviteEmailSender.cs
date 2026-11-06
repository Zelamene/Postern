namespace Postern.Application.Accounts;

public sealed record InviteEmail(
    string RecipientEmail,
    string InviteCode,
    string InviterName,
    DateTimeOffset ExpiresAt,
    string PublicBaseUrl);

public interface IInviteEmailSender
{
    Task<string> SendAsync(
        InviteEmail email,
        Guid outboxMessageId,
        CancellationToken cancellationToken);
}
