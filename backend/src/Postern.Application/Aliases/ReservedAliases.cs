namespace Postern.Application.Aliases;

public static class ReservedAliases
{
    private static readonly HashSet<string> Reserved = new(StringComparer.OrdinalIgnoreCase)
    {
        "admin",
        "postmaster",
        "abuse",
        "noreply",
        "support",
        "root",
        "hostmaster",
        "webmaster"
    };

    public static bool IsReserved(string? label) =>
        !string.IsNullOrWhiteSpace(label) && Reserved.Contains(label.Trim());
}
