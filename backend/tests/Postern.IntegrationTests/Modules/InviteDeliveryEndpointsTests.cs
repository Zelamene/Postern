using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Collections.Concurrent;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Postern.Application.Accounts;
using Postern.Domain.Accounts;
using Postern.Infrastructure.Accounts;
using Postern.Infrastructure.Integrations;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Modules;

[Collection(IntegrationCollection.Name)]
public sealed class InviteDeliveryEndpointsTests(PosternFixture fixture) : IAsyncLifetime
{
    private const string WebhookSigningKey = "webhook-test-signing-key-material";
    private static readonly string WebhookSecret =
        $"whsec_{Convert.ToBase64String(Encoding.UTF8.GetBytes(WebhookSigningKey))}";
    private PosternApiFactory _factory = null!;

    public Task InitializeAsync()
    {
        _factory = new PosternApiFactory(fixture, resendWebhookSecret: WebhookSecret);
        return Task.CompletedTask;
    }

    public Task DisposeAsync()
    {
        _factory.Dispose();
        return Task.CompletedTask;
    }

    [Fact]
    public async Task PublicRequestIsStoredForReviewWithoutSendingEmail()
    {
        var email = $"requester-{Guid.NewGuid():N}@example.test";
        using var client = _factory.CreateClient();
        var response = await client.PostAsJsonAsync(
            "/api/invite-requests",
            new { email = $"  {email} " });

        Assert.Equal(HttpStatusCode.Accepted, response.StatusCode);
        await using var db = fixture.CreateContext();
        var request = await db.InviteRequests.SingleAsync(
            item => item.EmailNormalized == NormalizeIdentity(email));
        Assert.Equal(email, request.Email);
        Assert.Equal(NormalizeIdentity(email), request.EmailNormalized);
        Assert.Equal("pending", request.Status);
        Assert.False(await db.InviteCodes.AnyAsync(invite => invite.Email == email));
        Assert.False(await db.InviteEmailOutbox.AnyAsync(message => message.RecipientEmail == email));
    }

    [Fact]
    public async Task AdminApprovalCreatesProtectedOutboxAndResendRotatesInvite()
    {
        var admin = await fixture.AUserAsync(isAdmin: true);
        var email = $"approved-{Guid.NewGuid():N}@example.test";
        using var publicClient = _factory.CreateClient();
        var requestResponse = await publicClient.PostAsJsonAsync(
            "/api/invite-requests",
            new { email });
        Assert.Equal(HttpStatusCode.Accepted, requestResponse.StatusCode);

        await using var seedDb = fixture.CreateContext();
        var request = await seedDb.InviteRequests.SingleAsync(
            item => item.EmailNormalized == NormalizeIdentity(email));
        using var adminClient = _factory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);

        var approval = await adminClient.PostAsync(
            $"/api/admin/invite-requests/{request.Id}/approve",
            content: null);
        Assert.Equal(HttpStatusCode.Accepted, approval.StatusCode);

        await using var approvedDb = fixture.CreateContext();
        var invite = await approvedDb.InviteCodes.SingleAsync(item => item.Email == email);
        var firstOutboxMessage = await approvedDb.InviteEmailOutbox.SingleAsync(
            item => item.InviteId == invite.Id);
        Assert.Equal(email, invite.Email);
        Assert.Equal(InviteDeliveryStatus.Pending, invite.DeliveryStatus);
        Assert.Equal("pending", firstOutboxMessage.Status);
        Assert.NotEmpty(firstOutboxMessage.ProtectedInviteCode);
        var protector = _factory.Services.GetRequiredService<IInviteCodeProtector>();
        Assert.StartsWith("postern_invite_", protector.Unprotect(firstOutboxMessage.ProtectedInviteCode));
        Assert.Equal(
            invite.Id,
            await approvedDb.InviteRequests
                .Where(item => item.Id == request.Id)
                .Select(item => item.InviteId)
                .SingleAsync());

        var resend = await adminClient.PostAsync(
            $"/api/admin/invites/{invite.Id}/resend",
            content: null);
        Assert.Equal(HttpStatusCode.Accepted, resend.StatusCode);

        await using var resentDb = fixture.CreateContext();
        var reloadedInvite = await resentDb.InviteCodes.SingleAsync();
        var oldMessage = await resentDb.InviteEmailOutbox.SingleAsync(
            message => message.Id == firstOutboxMessage.Id);
        var newMessage = await resentDb.InviteEmailOutbox.SingleAsync(
            message => message.Id != firstOutboxMessage.Id);
        Assert.NotEqual(invite.CodeHash, reloadedInvite.CodeHash);
        Assert.Equal("cancelled", oldMessage.Status);
        Assert.Equal(string.Empty, oldMessage.ProtectedInviteCode);
        Assert.Equal("pending", newMessage.Status);
    }

    [Fact]
    public async Task OutboxWorkerSendsQueuedInviteAndStoresProviderStatus()
    {
        await using (var cleanupDb = fixture.CreateContext())
        {
            await cleanupDb.InviteEmailOutbox
                .Where(message => message.Status == "pending" || message.Status == "processing")
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(message => message.Status, "cancelled")
                    .SetProperty(message => message.ProtectedInviteCode, string.Empty));
        }

        var sender = new RecordingInviteEmailSender();
        using var workerFactory = new PosternApiFactory(
            fixture,
            resendWebhookSecret: WebhookSecret,
            enableInviteWorker: true,
            inviteEmailSender: sender);
        var admin = await fixture.AUserAsync(isAdmin: true);
        var email = $"worker-{Guid.NewGuid():N}@example.test";
        using var publicClient = workerFactory.CreateClient();
        var requestResponse = await publicClient.PostAsJsonAsync(
            "/api/invite-requests",
            new { email });
        Assert.Equal(HttpStatusCode.Accepted, requestResponse.StatusCode);

        await using var seedDb = fixture.CreateContext();
        var inviteRequest = await seedDb.InviteRequests.SingleAsync(
            item => item.EmailNormalized == NormalizeIdentity(email));
        using var adminClient = workerFactory.CreateAuthenticatedClient(admin.Id, admin.Email, isAdmin: true);
        var approval = await adminClient.PostAsync(
            $"/api/admin/invite-requests/{inviteRequest.Id}/approve",
            content: null);
        Assert.Equal(HttpStatusCode.Accepted, approval.StatusCode);

        for (var attempt = 0; attempt < 60; attempt++)
        {
            await using var db = fixture.CreateContext();
            var message = await db.InviteEmailOutbox
                .SingleOrDefaultAsync(item => item.RecipientEmail == email);
            if (message?.Status == "sent")
            {
                break;
            }
            await Task.Delay(TimeSpan.FromMilliseconds(250));
        }

        await using var resultDb = fixture.CreateContext();
        var deliveredInvite = await resultDb.InviteCodes.SingleAsync(invite => invite.Email == email);
        var deliveredMessage = await resultDb.InviteEmailOutbox.SingleAsync(
            message => message.InviteId == deliveredInvite.Id);
        Assert.NotNull(deliveredInvite);
        Assert.NotNull(deliveredMessage);
        Assert.True(
            deliveredMessage.Status == "sent",
            $"Expected a sent outbox message; status={deliveredMessage.Status}, attempts={deliveredMessage.AttemptCount}, " +
            $"lastError={deliveredMessage.LastError}, sentAt={deliveredMessage.SentAt}, " +
            $"senderCalls={sender.SentEmails.Count}, senderRecipients={string.Join(",", sender.SentEmails.Select(item => item.RecipientEmail))}, " +
            $"providerMessageId={deliveredMessage.ProviderMessageId}.");
        Assert.Equal(InviteDeliveryStatus.Sent, deliveredInvite.DeliveryStatus);
        Assert.Equal(string.Empty, deliveredMessage.ProtectedInviteCode);
        var sentEmail = Assert.Single(sender.SentEmails);
        Assert.Equal(email, sentEmail.RecipientEmail);
        Assert.StartsWith("postern_invite_", sentEmail.InviteCode);
    }

    [Fact]
    public async Task UnboundLegacyInvitesAreAcceptedOnlyInDevelopment()
    {
        var now = DateTimeOffset.UtcNow;
        var developmentCodeHash = $"development-{Guid.NewGuid():N}";
        var productionCodeHash = $"production-{Guid.NewGuid():N}";
        await using (var seedDb = fixture.CreateContext())
        {
            seedDb.InviteCodes.AddRange(
                new InviteCode
                {
                    Id = Guid.NewGuid(),
                    CodeHash = developmentCodeHash,
                    Email = string.Empty,
                    EmailNormalized = string.Empty,
                    CreatedAt = now,
                    ExpiresAt = now.AddDays(1)
                },
                new InviteCode
                {
                    Id = Guid.NewGuid(),
                    CodeHash = productionCodeHash,
                    Email = string.Empty,
                    EmailNormalized = string.Empty,
                    CreatedAt = now,
                    ExpiresAt = now.AddDays(1)
                });
            await seedDb.SaveChangesAsync();
        }

        var developmentEmail = $"legacy-dev-{Guid.NewGuid():N}@example.test";
        await using (var developmentDb = fixture.CreateContext())
        {
            var repository = new EfAccountRepository(developmentDb, allowUnboundDevelopmentInvites: true);
            var result = await repository.RegisterPendingUserAsync(
                CreatePendingUser(developmentEmail, now),
                [],
                developmentCodeHash,
                200,
                now,
                CancellationToken.None);
            Assert.Equal(RegistrationResult.Created, result);
        }

        var productionEmail = $"legacy-prod-{Guid.NewGuid():N}@example.test";
        await using (var productionDb = fixture.CreateContext())
        {
            var repository = new EfAccountRepository(productionDb, allowUnboundDevelopmentInvites: false);
            var result = await repository.RegisterPendingUserAsync(
                CreatePendingUser(productionEmail, now),
                [],
                productionCodeHash,
                200,
                now,
                CancellationToken.None);
            Assert.Equal(RegistrationResult.InvalidInvite, result);
        }
    }

    [Fact]
    public async Task ResendWebhookVerifiesSignatureAndUpdatesDeliveryStatusOnce()
    {
        var providerMessageId = $"resend-message-{Guid.NewGuid():N}";
        var inviteId = Guid.NewGuid();
        var recipient = $"recipient-{Guid.NewGuid():N}@example.test";
        await using (var seedDb = fixture.CreateContext())
        {
            seedDb.InviteCodes.Add(new InviteCode
            {
                Id = inviteId,
                CodeHash = $"test-hash-{Guid.NewGuid():N}",
                Email = recipient,
                EmailNormalized = recipient.ToUpperInvariant(),
                CreatedAt = DateTimeOffset.UtcNow,
                ExpiresAt = DateTimeOffset.UtcNow.AddDays(7),
                DeliveryStatus = InviteDeliveryStatus.Sent,
                DeliveryMessageId = providerMessageId
            });
            await seedDb.SaveChangesAsync();
        }

        using var client = _factory.CreateClient();
        var body = System.Text.Json.JsonSerializer.Serialize(new
        {
            type = "email.delivered",
            data = new { email_id = providerMessageId }
        });
        var eventId = $"event-delivered-{Guid.NewGuid():N}";
        using var request = CreateWebhookRequest(body, eventId, DateTimeOffset.UtcNow);
        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var duplicate = CreateWebhookRequest(body, eventId, DateTimeOffset.UtcNow);
        var duplicateResponse = await client.SendAsync(duplicate);
        Assert.Equal(HttpStatusCode.OK, duplicateResponse.StatusCode);

        await using var db = fixture.CreateContext();
        var invite = await db.InviteCodes.SingleAsync(item => item.Id == inviteId);
        Assert.Equal(InviteDeliveryStatus.Delivered, invite.DeliveryStatus);
        Assert.Equal(1, await db.ResendWebhookEvents.CountAsync(item => item.Id == eventId));
    }

    [Fact]
    public async Task ResendWebhookRejectsInvalidSignature()
    {
        using var client = _factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/webhooks/resend")
        {
            Content = new StringContent(
                """{"type":"email.bounced","data":{"email_id":"unknown"}}""",
                Encoding.UTF8,
                "application/json")
        };
        request.Headers.Add("svix-id", "event-invalid-signature");
        request.Headers.Add("svix-timestamp", DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString());
        request.Headers.Add("svix-signature", "v1,invalid");

        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Theory]
    [InlineData("""{"type":42,"data":{"email_id":"unknown"}}""")]
    [InlineData("""{"type":"email.bounced","data":[]}""")]
    [InlineData("""{"type":"email.bounced","data":{"email_id":42}}""")]
    public async Task ResendWebhookRejectsMalformedJsonTypes(string body)
    {
        using var client = _factory.CreateClient();
        using var request = CreateWebhookRequest(
            body,
            $"event-malformed-{Guid.NewGuid():N}",
            DateTimeOffset.UtcNow);

        var response = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task ResendSenderUsesBrandedEscapedEmailAndConfiguredPublicOrigin()
    {
        var handler = new RecordingHttpMessageHandler();
        using var httpClient = new HttpClient(handler)
        {
            BaseAddress = new Uri("https://api.resend.com/")
        };
        var sender = new ResendEmailSender(httpClient, "test-api-key", "Postern <invites@mail.3xyz.uk>");

        var messageId = await sender.SendAsync(
            new InviteEmail(
                "recipient@example.test",
                "postern_invite_secret",
                "<img src=x>",
                DateTimeOffset.Parse("2026-11-11T00:00:00Z"),
                "https://postern-render.com"),
            Guid.NewGuid(),
            CancellationToken.None);

        Assert.Equal("resend-message-1", messageId);
        Assert.NotNull(handler.RequestBody);
        using var document = System.Text.Json.JsonDocument.Parse(handler.RequestBody);
        var root = document.RootElement;
        Assert.Equal("Postern <invites@mail.3xyz.uk>", root.GetProperty("from").GetString());
        Assert.Contains(
            "href=\"https://postern-render.com/invite/postern_invite_secret\"",
            root.GetProperty("html").GetString());
        Assert.Contains("&lt;img src=x&gt;", root.GetProperty("html").GetString());
        Assert.Contains("https://postern-render.com/invite/postern_invite_secret", root.GetProperty("text").GetString());
        Assert.DoesNotContain("localhost:5173", root.GetProperty("text").GetString());
        Assert.True(handler.HasIdempotencyKey);
    }

    private static HttpRequestMessage CreateWebhookRequest(
        string body,
        string eventId,
        DateTimeOffset timestamp)
    {
        var timestampValue = timestamp.ToUnixTimeSeconds().ToString();
        var payload = Encoding.UTF8.GetBytes($"{eventId}.{timestampValue}.{body}");
        var secret = Convert.FromBase64String(WebhookSecret["whsec_".Length..]);
        var signature = Convert.ToBase64String(HMACSHA256.HashData(secret, payload));
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/webhooks/resend")
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
        request.Headers.Add("svix-id", eventId);
        request.Headers.Add("svix-timestamp", timestampValue);
        request.Headers.Add("svix-signature", $"v1,{signature}");
        return request;
    }

    private static string NormalizeIdentity(string email)
    {
        var separator = email.LastIndexOf('@');
        return $"{email[..separator].ToUpperInvariant()}@{email[(separator + 1)..].ToLowerInvariant()}";
    }

    private static Postern.Domain.Accounts.PosternUser CreatePendingUser(string email, DateTimeOffset now) =>
        new()
        {
            Id = Guid.NewGuid(),
            Email = email,
            NormalizedEmail = NormalizeIdentity(email),
            PasswordHash = "test-hash",
            Status = "pending",
            CreatedAt = now
        };

    private sealed class RecordingHttpMessageHandler : HttpMessageHandler
    {
        public string? RequestBody { get; private set; }
        public bool HasIdempotencyKey { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken)
        {
            RequestBody = await request.Content!.ReadAsStringAsync(cancellationToken);
            HasIdempotencyKey = request.Headers.Contains("Idempotency-Key");
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("""{"id":"resend-message-1"}""", Encoding.UTF8, "application/json")
            };
        }
    }

    private sealed class RecordingInviteEmailSender : IInviteEmailSender
    {
        public ConcurrentQueue<InviteEmail> SentEmails { get; } = new();

        public Task<string> SendAsync(
            InviteEmail email,
            Guid outboxMessageId,
            CancellationToken cancellationToken)
        {
            SentEmails.Enqueue(email);
            return Task.FromResult("resend-worker-test-message");
        }
    }
}
