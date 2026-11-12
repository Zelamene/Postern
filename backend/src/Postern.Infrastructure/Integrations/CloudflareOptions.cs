namespace Postern.Infrastructure.Integrations;

public sealed class CloudflareOptions
{
    public const string SectionName = "Cloudflare";

    public string AccountId { get; init; } = string.Empty;
    public string ApiToken { get; init; } = string.Empty;
    public string KvNamespaceId { get; init; } = string.Empty;

    public bool IsConfigured =>
        !string.IsNullOrWhiteSpace(AccountId)
        && !string.IsNullOrWhiteSpace(ApiToken)
        && !string.IsNullOrWhiteSpace(KvNamespaceId);

    public void Validate()
    {
        if (!IsConfigured)
        {
            throw new InvalidOperationException(
                "Cloudflare:AccountId, Cloudflare:ApiToken, and Cloudflare:KvNamespaceId are required outside Development.");
        }
    }
}
