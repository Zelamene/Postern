using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace Postern.Api.Realtime;

[Authorize]
public sealed class UserEventsHub : Hub<IUserEventsClient>
{
    public override async Task OnConnectedAsync()
    {
        if (Guid.TryParse(Context.UserIdentifier, out var userId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, GroupName(userId));
        }

        await base.OnConnectedAsync();
    }

    public static string GroupName(Guid userId) => $"user:{userId:N}";
}

public interface IUserEventsClient
{
    Task AliasesChanged();

    Task MessageReceived(Guid aliasId);

    Task BlockedMessageReceived(Guid aliasId);

    Task AccountChanged();
}

public interface IUserRealtimeNotifier
{
    Task AliasesChangedAsync(Guid userId);

    Task MessageReceivedAsync(Guid userId, Guid aliasId);

    Task BlockedMessageReceivedAsync(Guid userId, Guid aliasId);

    Task AccountChangedAsync(Guid userId);
}

public sealed class UserRealtimeNotifier(
    IHubContext<UserEventsHub, IUserEventsClient> hubContext,
    ILogger<UserRealtimeNotifier> logger) : IUserRealtimeNotifier
{
    public Task AliasesChangedAsync(Guid userId) =>
        NotifyAsync(
            userId,
            "alias change",
            clients => clients.AliasesChanged());

    public Task MessageReceivedAsync(Guid userId, Guid aliasId) =>
        NotifyAsync(
            userId,
            "message received",
            clients => clients.MessageReceived(aliasId));

    public Task BlockedMessageReceivedAsync(Guid userId, Guid aliasId) =>
        NotifyAsync(
            userId,
            "blocked message received",
            clients => clients.BlockedMessageReceived(aliasId));

    public Task AccountChangedAsync(Guid userId) =>
        NotifyAsync(
            userId,
            "account change",
            clients => clients.AccountChanged());

    private async Task NotifyAsync(
        Guid userId,
        string eventName,
        Func<IUserEventsClient, Task> send)
    {
        try
        {
            await send(hubContext.Clients.Group(UserEventsHub.GroupName(userId)));
        }
        catch (Exception exception)
        {
            logger.LogWarning(
                exception,
                "Could not publish the user {EventName} event; page data remains available through the API.",
                eventName);
        }
    }
}
