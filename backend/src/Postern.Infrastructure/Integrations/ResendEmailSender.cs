using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Encodings.Web;
using Postern.Application.Accounts;

namespace Postern.Infrastructure.Integrations;

public sealed class ResendEmailSender(HttpClient httpClient, string apiKey, string from) : IInviteEmailSender
{
    private const string ResendEndpoint = "emails";

    public async Task<string> SendAsync(
        InviteEmail email,
        Guid outboxMessageId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException("Resend:ApiKey is not configured.");
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, ResendEndpoint);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        request.Headers.Add("Idempotency-Key", outboxMessageId.ToString("N"));
        request.Content = JsonContent.Create(new
        {
            from,
            to = new[] { email.RecipientEmail },
            subject = InviteEmailTemplate.Subject(email.InviterName),
            html = InviteEmailTemplate.Html(email),
            text = InviteEmailTemplate.Text(email)
        });

        using var response = await httpClient.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            throw new HttpRequestException(
                $"Resend rejected the invite email with HTTP {(int)response.StatusCode}.",
                null,
                response.StatusCode);
        }

        var result = await response.Content.ReadFromJsonAsync<ResendEmailResponse>(
            cancellationToken: cancellationToken);
        if (string.IsNullOrWhiteSpace(result?.Id))
        {
            throw new InvalidOperationException("Resend returned a successful response without an email ID.");
        }

        return result.Id;
    }

    private sealed record ResendEmailResponse(string? Id);
}

internal static class InviteEmailTemplate
{
    public static string Subject(string inviterName) =>
        string.IsNullOrWhiteSpace(inviterName) || inviterName == "An admin"
            ? "Your Postern invitation"
            : $"Your Postern invitation from {inviterName}";

    public static string Html(InviteEmail email)
    {
        var inviteUrl = BuildInviteUrl(email);
        var inviter = HtmlEncoder.Default.Encode(email.InviterName);
        var safeUrl = HtmlEncoder.Default.Encode(inviteUrl);
        var expiration = HtmlEncoder.Default.Encode(FormatExpiration(email.ExpiresAt));

        return $$"""
            <!doctype html>
            <html lang="en">
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <meta name="color-scheme" content="light">
                <title>Your Postern invitation</title>
              </head>
              <body style="margin:0;padding:32px 16px;background:#fbf8f4;color:#211c1b;font-family:Manrope,'Helvetica Neue',Arial,sans-serif;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;">
                  <tr><td style="padding:8px 0 20px;text-align:center;">
                    <span style="color:#74172a;font-size:22px;font-weight:800;letter-spacing:-.03em;">Postern</span>
                  </td></tr>
                  <tr><td style="padding:36px 32px;background:#ffffff;border:1px solid #e4dad0;border-radius:16px;">
                    <p style="margin:0 0 10px;color:#74172a;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;">A quieter way in</p>
                    <h1 style="margin:0 0 18px;font-size:28px;line-height:1.2;letter-spacing:-.03em;color:#211c1b;">You’re invited to Postern.</h1>
                    <p style="margin:0 0 8px;font-size:16px;line-height:1.65;color:#3a3330;">{{inviter}} invited you to create private email aliases and keep control of your inbox.</p>
                    <p style="margin:0 0 26px;font-size:14px;line-height:1.6;color:#57504d;">Your invitation is valid until {{expiration}}.</p>
                    <p style="margin:0 0 24px;text-align:center;">
                      <a href="{{safeUrl}}" style="display:inline-block;padding:14px 24px;border-radius:8px;background:#74172a;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;">Accept your invitation</a>
                    </p>
                    <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#57504d;">If the button doesn’t work, copy this link into your browser:</p>
                    <p style="margin:0;overflow-wrap:anywhere;font-size:12px;line-height:1.5;"><a href="{{safeUrl}}" style="color:#74172a;">{{safeUrl}}</a></p>
                  </td></tr>
                  <tr><td style="padding:20px 12px;text-align:center;font-size:12px;line-height:1.6;color:#57504d;">
                    If you weren’t expecting this invitation, you can ignore this email.
                  </td></tr>
                </table>
              </body>
            </html>
            """;
    }

    public static string Text(InviteEmail email)
    {
        var inviteUrl = BuildInviteUrl(email);
        return string.Join(
            Environment.NewLine,
            "You’re invited to Postern.",
            "",
            $"{email.InviterName} invited you to create private email aliases and keep control of your inbox.",
            $"Your invitation is valid until {FormatExpiration(email.ExpiresAt)}.",
            "",
            $"Accept your invitation: {inviteUrl}",
            "",
            "If you weren’t expecting this invitation, you can ignore this email.");
    }

    private static string BuildInviteUrl(InviteEmail email)
    {
        var baseUri = new Uri(email.PublicBaseUrl.TrimEnd('/') + "/", UriKind.Absolute);
        return new Uri(baseUri, $"invite/{Uri.EscapeDataString(email.InviteCode)}").AbsoluteUri;
    }

    private static string FormatExpiration(DateTimeOffset expiresAt) =>
        expiresAt.UtcDateTime.ToString("MMMM d, yyyy 'UTC'", CultureInfo.InvariantCulture);
}
