using Postern.Api.Realtime;

namespace Postern.IntegrationTests.Fixtures;

public sealed class RecordingAdminRealtimeNotifier : IAdminRealtimeNotifier
{
    private int _inviteRequestCount;
    private int _invitationAcceptedCount;
    private int _invitesChangedCount;
    private int _operationsChangedCount;

    public int InviteRequestCount => Volatile.Read(ref _inviteRequestCount);

    public int InvitationAcceptedCount => Volatile.Read(ref _invitationAcceptedCount);

    public int InvitesChangedCount => Volatile.Read(ref _invitesChangedCount);

    public int OperationsChangedCount => Volatile.Read(ref _operationsChangedCount);

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

    public Task InvitesChangedAsync()
    {
        Interlocked.Increment(ref _invitesChangedCount);
        return Task.CompletedTask;
    }

    public Task OperationsChangedAsync()
    {
        Interlocked.Increment(ref _operationsChangedCount);
        return Task.CompletedTask;
    }
}
