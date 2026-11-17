using System.Text.Json;
using Postern.Application.Aliases;

namespace Postern.UnitTests;

public class Etld1ParityTests
{
    [Fact]
    public void Normalize_MatchesTheSharedCrossRuntimeCases()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "etld1-cases.json");
        Assert.True(File.Exists(path), $"Missing shared fixture at {path}.");

        var fixture = JsonSerializer.Deserialize<Fixture>(
            File.ReadAllText(path),
            new JsonSerializerOptions(JsonSerializerDefaults.Web));

        Assert.NotNull(fixture);
        Assert.NotEmpty(fixture!.Cases);

        foreach (var item in fixture.Cases)
        {
            Assert.Equal(item.Expected, Etld1Normalizer.Normalize(item.Header));
        }
    }

    private sealed record Fixture(string? Description, List<Etld1Case> Cases);

    private sealed record Etld1Case(string Header, string Expected);
}
