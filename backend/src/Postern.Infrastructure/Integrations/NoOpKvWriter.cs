using Postern.Application.Integrations;

namespace Postern.Infrastructure.Integrations;

public sealed class NoOpKvWriter : IKvWriter
{
    public Task PutAsync(string key, string value, CancellationToken cancellationToken) => Task.CompletedTask;

    public Task DeleteAsync(string key, CancellationToken cancellationToken) => Task.CompletedTask;

    public Task<string?> GetAsync(string key, CancellationToken cancellationToken) =>
        Task.FromResult<string?>(null);

    public Task<IReadOnlyCollection<string>> ListKeysAsync(CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyCollection<string>>(Array.Empty<string>());
}
