using Postern.Api.Realtime;

namespace Postern.IntegrationTests.Fixtures;

public sealed class RecordingAdminRealtimeNotifier : IAdminRealtimeNotifier
{
    private int _inviteRequestCount;
    private int _invitationAcceptedCount;

    public int InviteRequestCount => Volatile.Read(ref _inviteRequestCount);

    public int InvitationAcceptedCount => Volatile.Read(ref _invitationAcceptedCount);

    public Task InviteRequestReceivedAsync()
    {
        Interlocked.Increment(ref _inviteRequestCount);
        return Task.CompletedTask;
    }

    public Task InvitationAcceptedAsync()
    {
        Interlocked.Increment(ref _invitationAcceptedCount);
        return Task.CompletedTask;
    }
}
