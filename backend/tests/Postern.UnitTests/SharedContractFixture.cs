using System.Text.Json;

namespace Postern.UnitTests;

/// <summary>
/// Loads a cross-runtime fixture from the repository root and compares a writer's
/// output with the field set the fixture declares. Walking up from the test binary
/// keeps the fixtures readable directly from source, as in the integration suite.
/// </summary>
internal static class SharedContractFixture
{
    public static JsonElement Load(string fileName)
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null
            && !File.Exists(Path.Combine(directory.FullName, "shared", fileName)))
        {
            directory = directory.Parent;
        }

        Assert.NotNull(directory);
        using var document = JsonDocument.Parse(
            File.ReadAllText(Path.Combine(directory!.FullName, "shared", fileName)));
        return document.RootElement.Clone();
    }

    public static void AssertEmitsDeclaredFields(
        JsonElement payload,
        JsonElement declaration,
        string subject)
    {
        var expected = declaration.GetProperty("requiredFields")
            .EnumerateArray()
            .Select(field => field.GetString()!)
            .Concat(declaration.TryGetProperty("optionalFields", out var optional)
                ? optional.EnumerateArray().Select(field => field.GetString()!)
                : [])
            .Order(StringComparer.Ordinal)
            .ToArray();
        var actual = payload.EnumerateObject()
            .Select(property => property.Name)
            .Order(StringComparer.Ordinal)
            .ToArray();

        Assert.True(
            expected.SequenceEqual(actual),
            $"{subject}: expected fields [{string.Join(", ", expected)}] but emitted "
            + $"[{string.Join(", ", actual)}].");
        Assert.True(expected.Length > 0, $"The shared contract declares no fields for {subject}.");
    }
}
