namespace Postern.Application.Integrations;

public interface IJobHeartbeat
{
    Task NotifyCompletedAsync(CancellationToken cancellationToken);
}
