namespace Postern.Application.Integrations;

public interface IKvWriter
{
    Task PutAsync(string key, string jsonValue, CancellationToken cancellationToken);
    Task DeleteAsync(string key, CancellationToken cancellationToken);
}
