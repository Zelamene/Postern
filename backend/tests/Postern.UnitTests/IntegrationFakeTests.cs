using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public class IntegrationFakeTests
{
    [Fact]
    public async Task InMemoryKvWriterStoresDeletesAndCanFailOperations()
    {
        var writer = new InMemoryKvWriter();

        await writer.PutAsync("alias@example.test", "{\"status\":\"active\"}", CancellationToken.None);
        Assert.Equal("{\"status\":\"active\"}", writer.Values["alias@example.test"]);

        writer.ShouldFail = true;
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => writer.PutAsync("alias@example.test", "{}", CancellationToken.None));

        writer.ShouldFail = false;
        await writer.DeleteAsync("alias@example.test", CancellationToken.None);
        Assert.Empty(writer.Values);
    }

    [Fact]
    public async Task InMemoryDestinationServiceTracksVerificationAndCanFailOperations()
    {
        var service = new InMemoryDestinationService();

        await service.AddAsync("user@example.test", CancellationToken.None);
        Assert.False(await service.IsVerifiedAsync("user@example.test", CancellationToken.None));

        service.MarkVerified("user@example.test");
        Assert.True(await service.IsVerifiedAsync("USER@example.test", CancellationToken.None));

        service.ShouldFail = true;
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => service.RemoveAsync("user@example.test", CancellationToken.None));

        service.ShouldFail = false;
        await service.RemoveAsync("user@example.test", CancellationToken.None);
        Assert.Empty(service.Destinations);
    }
}
