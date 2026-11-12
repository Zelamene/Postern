using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Postern.Application.Integrations;

namespace Postern.Infrastructure.Integrations;

public sealed class CloudflareKvWriter(
    HttpClient httpClient,
    CloudflareOptions options,
    ILogger<CloudflareKvWriter> logger) : IKvWriter
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public Task PutAsync(string key, string jsonValue, CancellationToken cancellationToken) =>
        SendAsync(HttpMethod.Put, ValuePath(key), jsonValue, cancellationToken);

    public async Task DeleteAsync(string key, CancellationToken cancellationToken)
    {
        using var response = await httpClient.DeleteAsync(ValuePath(key), cancellationToken);
        if (response.StatusCode is HttpStatusCode.NotFound)
        {
            return;
        }

        await EnsureSuccessAsync(response, "delete", key, cancellationToken);
    }

    public async Task<string?> GetAsync(string key, CancellationToken cancellationToken)
    {
        using var response = await httpClient.GetAsync(ValuePath(key), cancellationToken);
        if (response.StatusCode is HttpStatusCode.NotFound)
        {
            return null;
        }

        await EnsureSuccessAsync(response, "get", key, cancellationToken);
        return await response.Content.ReadAsStringAsync(cancellationToken);
    }

    public async Task<IReadOnlyCollection<string>> ListKeysAsync(CancellationToken cancellationToken)
    {
        var keys = new List<string>();
        string? cursor = null;

        do
        {
            var path = $"accounts/{options.AccountId}/storage/kv/namespaces/{options.KvNamespaceId}/keys?limit=1000";
            if (!string.IsNullOrEmpty(cursor))
            {
                path += $"&cursor={Uri.EscapeDataString(cursor)}";
            }

            using var response = await httpClient.GetAsync(path, cancellationToken);
            await EnsureSuccessAsync(response, "list", "*", cancellationToken);

            var envelope = await response.Content.ReadFromJsonAsync<CloudflareEnvelope<List<CloudflareKey>>>(
                JsonOptions,
                cancellationToken);

            if (envelope?.Result is { Count: > 0 } page)
            {
                keys.AddRange(page.Select(item => item.Name));
            }

            cursor = envelope?.ResultInfo?.Cursor;
        }
        while (!string.IsNullOrEmpty(cursor));

        return keys;
    }

    private async Task SendAsync(
        HttpMethod method,
        string path,
        string value,
        CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(method, path)
        {
            Content = new StringContent(value, System.Text.Encoding.UTF8, "application/json")
        };

        using var response = await httpClient.SendAsync(request, cancellationToken);
        await EnsureSuccessAsync(response, method.Method.ToLowerInvariant(), path, cancellationToken);
    }

    private async Task EnsureSuccessAsync(
        HttpResponseMessage response,
        string operation,
        string key,
        CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode)
        {
            return;
        }

        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        logger.LogError(
            "Cloudflare KV {Operation} failed for {Key} with {Status}: {Body}",
            operation,
            key,
            (int)response.StatusCode,
            body);

        response.EnsureSuccessStatusCode();
    }

    private string ValuePath(string key) =>
        $"accounts/{options.AccountId}/storage/kv/namespaces/{options.KvNamespaceId}/values/{Uri.EscapeDataString(key)}";

    private sealed record CloudflareEnvelope<T>(
        [property: JsonPropertyName("success")] bool Success,
        [property: JsonPropertyName("result")] T? Result,
        [property: JsonPropertyName("result_info")] CloudflareResultInfo? ResultInfo);

    private sealed record CloudflareResultInfo(
        [property: JsonPropertyName("cursor")] string? Cursor);

    private sealed record CloudflareKey(
        [property: JsonPropertyName("name")] string Name);
}
