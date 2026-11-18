using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Postern.Api.Security;
using Postern.Application.Accounts;
using Postern.IntegrationTests.Collections;
using Postern.IntegrationTests.Fixtures;

namespace Postern.IntegrationTests.Database;

/// <summary>
/// QR1.2: protected values must remain decryptable after a restart. The test runs in
/// Production so the key ring comes from PostgreSQL; in Development the filesystem
/// fallback would let a naive version of this test pass without touching the database.
/// </summary>
[Collection(IntegrationCollection.Name)]
public sealed class DataProtectionRestartTests(PosternFixture fixture)
{
    [Fact]
    public async Task ProtectedInviteCode_IsReadableByASecondHostUsingOnlyTheDatabase()
    {
        var payload = $"postern_invite_{Guid.NewGuid():N}";
        string protectedValue;
        string discriminator;

        await using (var keysBefore = fixture.CreateContext())
        {
            Assert.Equal(0, await keysBefore.DataProtectionKeys.CountAsync());
        }

        using (var first = CreateProductionHost())
        {
            Assert.Equal("Production", first.Services.GetRequiredService<IHostEnvironment>().EnvironmentName);

            var protector = first.Services.GetRequiredService<IInviteCodeProtector>();
            protectedValue = protector.Protect(payload);
            discriminator = first.Services
                .GetRequiredService<IOptions<DataProtectionOptions>>()
                .Value
                .ApplicationDiscriminator ?? string.Empty;

            await using var db = fixture.CreateContext();
            var stored = await db.DataProtectionKeys.SingleAsync();
            Assert.False(string.IsNullOrWhiteSpace(stored.Xml));
        }

        using (var second = CreateProductionHost())
        {
            Assert.Equal(
                discriminator,
                second.Services
                    .GetRequiredService<IOptions<DataProtectionOptions>>()
                    .Value
                    .ApplicationDiscriminator);

            var protector = second.Services.GetRequiredService<IInviteCodeProtector>();

            Assert.Equal(payload, protector.Unprotect(protectedValue));
        }
    }

    private PosternApiFactory CreateProductionHost() =>
        new(
            fixture,
            enableInviteWorker: true,
            inviteEmailSender: new SilentInviteEmailSender());

    private sealed class SilentInviteEmailSender : IInviteEmailSender
    {
        public Task<string> SendAsync(
            InviteEmail email,
            Guid outboxMessageId,
            CancellationToken cancellationToken) =>
            Task.FromResult("data-protection-test-message");
    }
}
