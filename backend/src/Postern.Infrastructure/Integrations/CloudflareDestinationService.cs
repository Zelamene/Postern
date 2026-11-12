using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Postern.Application.Integrations;

namespace Postern.Infrastructure.Integrations;

public sealed class CloudflareDestinationService(
    HttpClient httpClient,
    CloudflareOptions options,
    ILogger<CloudflareDestinationService> logger) : IDestinationService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task AddAsync(string emailAddress, CancellationToken cancellationToken)
    {
        var existing = await FindAsync(emailAddress, cancellationToken);
        if (existing is not null)
        {
            return;
        }

        using var response = await httpClient.PostAsJsonAsync(
            $"accounts/{options.AccountId}/email/routing/addresses",
            new { email = emailAddress },
            JsonOptions,
            cancellationToken);

        if (response.StatusCode is HttpStatusCode.Conflict)
        {
            return;
        }

        await EnsureSuccessAsync(response, "create destination", emailAddress, cancellationToken);
    }

    public async Task<bool> IsVerifiedAsync(string emailAddress, CancellationToken cancellationToken)
    {
        var existing = await FindAsync(emailAddress, cancellationToken);
        return existing is not null && existing.Verified is not null;
    }

    public async Task RemoveAsync(string emailAddress, CancellationToken cancellationToken)
    {
        var existing = await FindAsync(emailAddress, cancellationToken);
        if (existing is null)
        {
            return;
        }

        using var response = await httpClient.DeleteAsync(
            $"accounts/{options.AccountId}/email/routing/addresses/{existing.Id}",
            cancellationToken);

        if (response.StatusCode is HttpStatusCode.NotFound)
        {
            return;
        }

        await EnsureSuccessAsync(response, "delete destination", emailAddress, cancellationToken);
    }

    private async Task<Destination?> FindAsync(string emailAddress, CancellationToken cancellationToken)
    {
        for (var page = 1; ; page++)
        {
            var path =
                $"accounts/{options.AccountId}/email/routing/addresses?per_page=50&page={page}";

            using var response = await httpClient.GetAsync(path, cancellationToken);
            await EnsureSuccessAsync(response, "list destinations", "*", cancellationToken);

            var envelope = await response.Content.ReadFromJsonAsync<CloudflareEnvelope<List<Destination>>>(
                JsonOptions,
                cancellationToken);

            var items = envelope?.Result ?? [];
            var match = items.FirstOrDefault(
                item => string.Equals(item.Email, emailAddress, StringComparison.OrdinalIgnoreCase));

            if (match is not null)
            {
                return match;
            }

            if (items.Count < 50)
            {
                return null;
            }

            if (envelope?.ResultInfo?.TotalPages is int totalPages && page >= totalPages)
            {
                return null;
            }
        }
    }

    private async Task EnsureSuccessAsync(
        HttpResponseMessage response,
        string operation,
        string address,
        CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode)
        {
            return;
        }

        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        logger.LogError(
            "Cloudflare destination {Operation} failed for {Address} with {Status}: {Body}",
            operation,
            address,
            (int)response.StatusCode,
            body);

        response.EnsureSuccessStatusCode();
    }

    private sealed record CloudflareEnvelope<T>(
        [property: JsonPropertyName("success")] bool Success,
        [property: JsonPropertyName("result")] T? Result,
        [property: JsonPropertyName("result_info")] CloudflareResultInfo? ResultInfo);

    private sealed record CloudflareResultInfo(
        [property: JsonPropertyName("total_pages")] int? TotalPages);

    private sealed record Destination(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("email")] string Email,
        [property: JsonPropertyName("verified")] string? Verified);
}
