namespace Postern.Application.Aliases;

public sealed record AliasPolicy(string Domain, int SuffixLength)
{
    public const string DefaultDomain = "postern.local";
    public const int DefaultSuffixLength = 4;
    public const int MinimumSuffixLength = 4;
    public const int MaximumSuffixLength = 8;

    public static AliasPolicy Default { get; } = new(DefaultDomain, DefaultSuffixLength);

    public string BuildAddress(string label, string suffix) => $"{label}.{suffix}@{Domain}";
}
