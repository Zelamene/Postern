using System.Text.Json;

namespace Postern.IntegrationTests;

/// <summary>
/// QR7.1: the NFR matrix names five critical paths, so those five paths must be guarded
/// by tests that actually exist. The list lives in shared/critical-paths.json so it can be
/// referenced without restating test names in prose. This suite fails when a named test is
/// deleted, renamed, or marked skipped; the CI filter that runs these tests is the other
/// half of the gate.
/// </summary>
public sealed class CriticalPathInventoryTests
{
    private static readonly string[] ExpectedPathIds =
    [
        "account-lifecycle",
        "invite-administration",
        "alias-create-to-kv-publish",
        "mail-ingest-to-activity",
        "account-isolation",
    ];

    [Fact]
    public void TheInventory_NamesTheFiveDocumentedPaths()
    {
        var inventory = ReadInventory();

        Assert.Equal(
            ExpectedPathIds.Order(),
            inventory.Paths.Select(path => path.Id).Order());

        foreach (var path in inventory.Paths)
        {
            Assert.False(
                string.IsNullOrWhiteSpace(path.Description),
                $"Critical path '{path.Id}' has no description.");
            Assert.NotEmpty(path.Tests);
        }
    }

    [Fact]
    public void EveryNamedCriticalPathTest_ResolvesToALiveUnskippedTest()
    {
        var assembly = typeof(CriticalPathInventoryTests).Assembly;
        var problems = new List<string>();

        foreach (var path in ReadInventory().Paths)
        {
            foreach (var testName in path.Tests)
            {
                var (type, method) = Resolve(assembly, testName);

                if (type is null || method is null)
                {
                    problems.Add(
                        $"'{path.Id}' names {testName}, which does not exist. "
                        + "A critical path cannot be guarded by a test that was renamed or deleted.");
                    continue;
                }

                if (method.GetCustomAttributes(typeof(FactAttribute), inherit: true)
                    .Cast<FactAttribute>()
                    .Any(fact => fact.Skip is not null))
                {
                    problems.Add($"'{path.Id}' names {testName}, which is marked skipped.");
                }
            }
        }

        Assert.True(
            problems.Count == 0,
            string.Join(Environment.NewLine, problems));
    }

    private static (Type? Type, System.Reflection.MethodInfo? Method) Resolve(
        System.Reflection.Assembly assembly,
        string fullyQualifiedName)
    {
        var separator = fullyQualifiedName.LastIndexOf('.');
        if (separator <= 0)
        {
            return (null, null);
        }

        var typeName = fullyQualifiedName[..separator];
        var methodName = fullyQualifiedName[(separator + 1)..];

        var type = assembly.GetType(typeName, throwOnError: false);
        var method = type?
            .GetMethods(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance)
            .FirstOrDefault(candidate => candidate.Name == methodName);

        return (type, method);
    }

    private static CriticalPathInventory ReadInventory()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "critical-paths.json");
        Assert.True(File.Exists(path), $"Missing shared fixture at {path}.");

        var inventory = JsonSerializer.Deserialize<CriticalPathInventory>(
            File.ReadAllText(path),
            new JsonSerializerOptions(JsonSerializerDefaults.Web));

        Assert.NotNull(inventory);
        return inventory!;
    }

    private sealed record CriticalPathInventory(string? Description, List<CriticalPath> Paths);

    private sealed record CriticalPath(string Id, string Description, List<string> Tests);
}
