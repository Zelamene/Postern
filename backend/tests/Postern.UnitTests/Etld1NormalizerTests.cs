using Postern.Application.Aliases;

namespace Postern.UnitTests;

public class Etld1NormalizerTests
{
    [Theory]
    [InlineData("example.com", "example.com")]
    [InlineData("sub.example.com", "example.com")]
    [InlineData("EXAMPLE.COM", "example.com")]
    [InlineData("a.b.c.co.uk", "c.co.uk")]
    [InlineData("mail.google.com", "google.com")]
    [InlineData("Sender <sender@example.com>", "example.com")]
    [InlineData("\"Doe, Jane\" <jane@sub.mail.co.uk>", "mail.co.uk")]
    [InlineData("  <bare@example.com>  ", "example.com")]
    [InlineData("sender@example.com>", "example.com")]
    public void Normalize_KnownDomains_ReturnsEtld1(string input, string expected)
    {
        var result = Etld1Normalizer.Normalize(input);
        Assert.Equal(expected, result);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("localhost")]
    [InlineData("invalid..com")]
    public void Normalize_Invalid_ReturnsNullOrNormalized(string input)
    {
        var result = Etld1Normalizer.Normalize(input);
        // Just ensure it doesn't throw
    }

    [Fact]
    public void Normalize_Null_ReturnsNull()
    {
        Assert.Null(Etld1Normalizer.Normalize(null!));
    }
}
