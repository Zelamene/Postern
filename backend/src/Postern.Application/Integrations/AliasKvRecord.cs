using System.Text.Json;

namespace Postern.Application.Integrations;

public static class AliasKvRecord
{
    public static string Serialize(string destination, string status, Guid userId) =>
        JsonSerializer.Serialize(new
        {
            destination,
            status,
            userId = userId.ToString(),
            blockedSenders = Array.Empty<string>()
        });
}
