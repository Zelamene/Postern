namespace Postern.Domain.Accounts;

public static class InviteDeliveryStatus
{
    public const string Pending = "pending";
    public const string Sent = "sent";
    public const string Delivered = "delivered";
    public const string Bounced = "bounced";
    public const string Complained = "complained";
    public const string Accepted = "accepted";
    public const string Revoked = "revoked";
    public const string Failed = "failed";
}
