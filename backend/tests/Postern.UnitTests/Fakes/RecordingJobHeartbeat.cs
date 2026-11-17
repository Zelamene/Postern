using Postern.Application.Integrations;

namespace Postern.UnitTests.Fakes;

public sealed class RecordingJobHeartbeat : IJobHeartbeat
{
    public int Notifications { get; private set; }

    public Task NotifyCompletedAsync(CancellationToken cancellationToken)
    {
        Notifications += 1;
        return Task.CompletedTask;
    }
}
