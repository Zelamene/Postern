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
              <body style="margin:0;padding:40px 16px;background-color:#f9f9f9;color:#1b1b1b;font-family:Inter,'Helvetica Neue',Arial,sans-serif;">
                <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">One private address for every service.</div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;">
                  <tr><td style="padding:0 8px 28px;text-align:center;">
                    <span style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:700;letter-spacing:-.02em;color:#6b1d2f;">Postern</span>
                  </td></tr>
                  <tr><td style="padding:44px 40px;background-color:#ffffff;">
                    <p style="margin:0 0 18px;color:#6b1d2f;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;">A quieter way in</p>
                    <h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.22;letter-spacing:-.02em;font-weight:600;color:#1b1b1b;">You’re invited to Postern.</h1>
                    <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#2f2f2f;">{{inviter}} invited you to create private email aliases and keep control of your inbox.</p>
                    <p style="margin:0 0 30px;font-size:14px;line-height:1.6;color:#555555;">Your invitation is valid until {{expiration}}.</p>
                    <p style="margin:0 0 24px;text-align:center;">
                      <a href="{{safeUrl}}" style="display:inline-block;padding:15px 28px;background-color:#000000;color:#e2e2e2;font-size:15px;font-weight:700;letter-spacing:.01em;text-decoration:none;">Accept your invitation</a>
                    </p>
                    <p style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#555555;">If the button doesn’t work, copy this link into your browser:</p>
                    <p style="margin:0;overflow-wrap:anywhere;font-size:12px;line-height:1.5;"><a href="{{safeUrl}}" style="color:#6b1d2f;">{{safeUrl}}</a></p>
                  </td></tr>
                  <tr><td style="padding:22px 12px;text-align:center;font-size:12px;line-height:1.6;color:#555555;">
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
