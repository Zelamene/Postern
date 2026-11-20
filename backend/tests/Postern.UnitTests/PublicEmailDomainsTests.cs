using System.Text.Json;
using Postern.Application.Activity;

namespace Postern.UnitTests;

public sealed class PublicEmailDomainsTests
{
    [Fact]
    public void SharedContractDomainsAreRecognisedCaseInsensitively()
    {
        var domains = ReadDomains("public-email-domains.json");

        Assert.NotEmpty(domains);
        Assert.All(domains, domain => Assert.True(PublicEmailDomains.Contains(domain), domain));
        Assert.All(domains, domain => Assert.True(
            PublicEmailDomains.Contains(domain.ToUpperInvariant()),
            domain));
    }

    [Fact]
    public void EmbeddedListMatchesTheCanonicalSharedContract()
    {
        Assert.Equal(
            ReadDomains("public-email-domains.json"),
            ReadDomains("application-public-email-domains.json"));
    }

    [Fact]
    public void CorporateDomainsAndMissingDomainsAreNotPublicProviders()
    {
        Assert.False(PublicEmailDomains.Contains("netflix.com"));
        Assert.False(PublicEmailDomains.Contains("github.com"));
        Assert.False(PublicEmailDomains.Contains(string.Empty));
        Assert.False(PublicEmailDomains.Contains(null));
    }

    private static string[] ReadDomains(string fileName)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(fileName));
        return document.RootElement
            .GetProperty("domains")
            .EnumerateArray()
            .Select(element => element.GetString()!)
            .ToArray();
    }
}
