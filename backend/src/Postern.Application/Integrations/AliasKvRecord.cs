using System.Text.Json;

namespace Postern.Application.Integrations;

public static class AliasKvRecord
{
    public static string Serialize(
        string destination,
        string status,
        Guid userId,
        IEnumerable<string>? blockedSenders = null) =>
        JsonSerializer.Serialize(new
        {
            destination,
            status,
            userId = userId.ToString(),
            blockedSenders = (blockedSenders ?? [])
                .Where(sender => !string.IsNullOrWhiteSpace(sender))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(sender => sender, StringComparer.Ordinal)
                .ToArray()
        });
}
