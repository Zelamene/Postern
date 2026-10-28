using Postern.Application.Integrations;

namespace Postern.Infrastructure.Integrations;

public sealed class NoOpKvWriter : IKvWriter
{
    public Task PutAsync(string key, string value, CancellationToken cancellationToken) => Task.CompletedTask;

    public Task DeleteAsync(string key, CancellationToken cancellationToken) => Task.CompletedTask;
}
