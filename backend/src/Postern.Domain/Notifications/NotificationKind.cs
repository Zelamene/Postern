namespace Postern.Domain.Notifications;

public static class NotificationKind
{
    public const string MessageReceived = "message_received";
    public const string MessageBlocked = "message_blocked";
    public const string AliasCreated = "alias_created";
    public const string AliasDisabled = "alias_disabled";
    public const string AliasDeleted = "alias_deleted";
    public const string AliasReplaced = "alias_replaced";
    public const string AccountChanged = "account_changed";
    public const string InviteRequested = "invite_requested";
    public const string InvitationAccepted = "invitation_accepted";
    public const string InviteApproved = "invite_approved";
    public const string InviteRejected = "invite_rejected";
    public const string InviteResent = "invite_resent";
    public const string InviteRevoked = "invite_revoked";
    public const string UserSuspended = "user_suspended";
    public const string UserResumed = "user_resumed";
    public const string BlocklistChanged = "blocklist_changed";
    public const string KvSyncCompleted = "kv_sync_completed";
    public const string SuspendedUsersRebuilt = "suspended_users_rebuilt";
}
