using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Postern.Api.Realtime;

[Authorize(Policy = "admin")]
public sealed class AdminEventsHub : Hub<IAdminEventsClient>
{
}

public interface IAdminEventsClient
{
    Task InviteRequestReceived();

    Task InvitationAccepted();

    Task InvitesChanged();

    Task OperationsChanged();
}

public interface IAdminRealtimeNotifier
{
    Task InviteRequestReceivedAsync();

    Task InvitationAcceptedAsync();

    Task InvitesChangedAsync();

    Task OperationsChangedAsync();
}

public sealed class AdminRealtimeNotifier(
    IHubContext<AdminEventsHub, IAdminEventsClient> hubContext,
    ILogger<AdminRealtimeNotifier> logger) : IAdminRealtimeNotifier
{
    public Task InviteRequestReceivedAsync() =>
        NotifyAsync(
            "invite request",
            clients => clients.InviteRequestReceived());

    public Task InvitationAcceptedAsync() =>
        NotifyAsync(
            "invitation acceptance",
            clients => clients.InvitationAccepted());

    public Task InvitesChangedAsync() =>
        NotifyAsync(
            "invite change",
            clients => clients.InvitesChanged());

    public Task OperationsChangedAsync() =>
        NotifyAsync(
            "operations change",
            clients => clients.OperationsChanged());

    private async Task NotifyAsync(string eventName, Func<IAdminEventsClient, Task> send)
    {
        try
        {
            await send(hubContext.Clients.All);
        }
        catch (Exception exception)
        {
            logger.LogWarning(
                exception,
                "Could not publish the admin {EventName} event; dashboard data remains available through the API.",
                eventName);
        }
    }
}
