using System.Text.Json;

namespace Postern.Application.Activity;

/// <summary>
/// Shared mailbox providers: an eTLD+1 from this set identifies a mailbox host,
/// not the service that gave out an alias. These domains are never auto-trusted
/// on first contact; the user must mark the sender as expected explicitly.
/// The list is embedded from Activity/public-email-domains.json (a build-compatible
/// copy of the canonical shared/public-email-domains.json). Contract tests keep
/// the two copies and the web client in sync.
/// </summary>
public static class PublicEmailDomains
{
    private const string ResourceName = "Postern.Application.PublicEmailDomains.json";

    private static readonly HashSet<string> Domains = Load();

    public static bool Contains(string? etld1) =>
        etld1 is not null && Domains.Contains(etld1);

    private static HashSet<string> Load()
    {
        using var stream = typeof(PublicEmailDomains).Assembly.GetManifestResourceStream(ResourceName)
            ?? throw new InvalidOperationException($"Missing embedded resource {ResourceName}.");
        using var document = JsonDocument.Parse(stream);

        var domains = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var element in document.RootElement.GetProperty("domains").EnumerateArray())
        {
            var domain = element.GetString();
            if (!string.IsNullOrWhiteSpace(domain))
            {
                domains.Add(domain.Trim());
            }
        }

        return domains;
    }
}
