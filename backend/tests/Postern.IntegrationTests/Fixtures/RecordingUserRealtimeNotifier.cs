using System.Collections.Concurrent;
using Postern.Api.Realtime;

namespace Postern.IntegrationTests.Fixtures;

public sealed class RecordingUserRealtimeNotifier : IUserRealtimeNotifier
{
    private readonly ConcurrentQueue<Guid> _aliasesChanged = new();
    private readonly ConcurrentQueue<(Guid UserId, Guid AliasId)> _messages = new();
    private readonly ConcurrentQueue<(Guid UserId, Guid AliasId)> _blockedMessages = new();
    private readonly ConcurrentQueue<Guid> _accountChanged = new();

    public IReadOnlyCollection<Guid> AliasesChanged => _aliasesChanged.ToArray();

    public IReadOnlyCollection<(Guid UserId, Guid AliasId)> Messages => _messages.ToArray();

    public IReadOnlyCollection<(Guid UserId, Guid AliasId)> BlockedMessages =>
        _blockedMessages.ToArray();

    public IReadOnlyCollection<Guid> AccountChanged => _accountChanged.ToArray();

    public Task AliasesChangedAsync(Guid userId)
    {
        _aliasesChanged.Enqueue(userId);
        return Task.CompletedTask;
    }

    public Task MessageReceivedAsync(Guid userId, Guid aliasId)
    {
        _messages.Enqueue((userId, aliasId));
        return Task.CompletedTask;
    }

    public Task BlockedMessageReceivedAsync(Guid userId, Guid aliasId)
    {
        _blockedMessages.Enqueue((userId, aliasId));
        return Task.CompletedTask;
    }

    public Task AccountChangedAsync(Guid userId)
    {
        _accountChanged.Enqueue(userId);
        return Task.CompletedTask;
    }
}
