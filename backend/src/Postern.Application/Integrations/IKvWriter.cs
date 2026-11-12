namespace Postern.Application.Integrations;

public interface IKvWriter
{
    Task PutAsync(string key, string jsonValue, CancellationToken cancellationToken);
    Task DeleteAsync(string key, CancellationToken cancellationToken);
    Task<string?> GetAsync(string key, CancellationToken cancellationToken);
    Task<IReadOnlyCollection<string>> ListKeysAsync(CancellationToken cancellationToken);
}
