namespace Postern.Application.Aliases;

public static class Etld1Normalizer
{
    private static readonly HashSet<string> SecondLevelTlds = new(StringComparer.OrdinalIgnoreCase)
    {
        "co.uk", "org.uk", "ac.uk", "gov.uk", "net.uk", "com.au", "net.au", "org.au"
    };

    public static string? Normalize(string? domain)
    {
        if (string.IsNullOrWhiteSpace(domain))
        {
            return null;
        }

        var trimmed = domain.Trim().ToLowerInvariant();

        if (trimmed.Contains('@'))
        {
            var atIndex = trimmed.LastIndexOf('@');
            if (atIndex >= 0 && atIndex < trimmed.Length - 1)
            {
                trimmed = trimmed[(atIndex + 1)..];
            }
        }

        trimmed = trimmed.TrimEnd('.');

        var parts = trimmed.Split('.', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0)
        {
            return null;
        }

        if (parts.Length == 1)
        {
            return parts[0];
        }

        var lastTwo = string.Join(".", parts[^2..]);
        if (SecondLevelTlds.Contains(lastTwo) && parts.Length >= 3)
        {
            return string.Join(".", parts[^3..]);
        }

        return lastTwo;
    }
}
