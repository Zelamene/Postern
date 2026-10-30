# Integration tests

Real HTTP pipeline, real PostgreSQL. Docker must be running; the suite starts one
`postgres:18` container per test collection and drops it afterwards.

```
dotnet test backend/tests/Postern.IntegrationTests
```

## Layout

| Folder           | What belongs here                                                        |
| ---------------- | ------------------------------------------------------------------------ |
| `Api/`           | Routing, auth rejection, health, Swagger, startup guards. No data setup.  |
| `Constraints/`   | Schema invariants: check constraints, unique indexes, tombstone shape.    |
| `Flows/`         | Multi-step user journeys across modules (auth, ingest -> activity).       |
| `Infrastructure/`| EF Core repositories and DbContext behaviour against real PostgreSQL.     |
| `Modules/`       | One module's endpoints and read model (aliases, activity, accounts).      |
| `Workers/`       | Worker/API contract notes; worker-only logic lives in `worker/`.           |

## Writing a test

```csharp
[Collection(IntegrationCollection.Name)]
public sealed class MyTests(PosternFixture fixture) : IAsyncLifetime
{
    private PosternApiFactory _factory = null!;

    public Task InitializeAsync()
    {
        _factory = new PosternApiFactory(fixture);
        return Task.CompletedTask;
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task AuthenticatedRequest_SeesOwnData()
    {
        var user = await fixture.AUserAsync();
        var alias = await fixture.AnAliasAsync(user.Id);
        await fixture.AMessageAsync(alias.Id, subject: "hello");

        using var client = _factory.CreateAuthenticatedClient(user.Id, user.Email);
        var response = await client.GetAsync($"/api/aliases/{alias.Id}/messages");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }
}
```

Guidelines:

- Seed through `PosternFixture` (`AUserAsync`, `AnAliasAsync`, `AMessageAsync`,
  `ABlockedMessageAsync`). Every helper creates unique rows, so tests can share a container
  without cleanup and can run in any order.
- Use `PosternApiFactory.CreateAuthenticatedClient` for a real signed JWT cookie; use
  `PosternApiFactory.ForgedToken` when asserting rejection.
- Use `fixture.CreateContext()` for repository-level tests instead of starting the API.
- Assert on observable behaviour (status codes, response bodies, persisted columns), not on
  EF internals.
- Prefer one container and many tests: do not add `IClassFixture<PostgreSqlContainer>` per class.
