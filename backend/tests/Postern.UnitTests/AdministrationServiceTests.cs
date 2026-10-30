using System.Text.Json;
using Postern.Application.Accounts;
using Postern.Application.Administration;
using Postern.Domain.Accounts;
using Postern.Domain.Administration;
using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public class AdministrationServiceTests
{
    private static readonly DateTimeOffset Now = new(2026, 10, 30, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task SuspendUser_SetsStatusPublishesMapAndAudits()
    {
        var context = new Context();
        var target = context.AddUser("active");

        var outcome = await context.Service.SuspendUserAsync(
            context.AdminId,
            target.Id,
            "abuse report",
            CancellationToken.None);

        Assert.Equal(AdminOutcome.Succeeded, outcome);
        Assert.Equal("suspended", target.Status);
        Assert.True(ReadSuspendedUsers(context.Kv).GetProperty(target.Id.ToString()).GetBoolean());
        var audit = Assert.Single(context.Administration.AuditEntries);
        Assert.Equal("user.suspend", audit.Action);
        Assert.Equal(target.Id.ToString(), audit.TargetId);
        Assert.Equal(context.AdminId, audit.AdminUserId);
        Assert.Equal(Now, audit.CreatedAt);
        Assert.Equal("abuse report", ReadMetadataReason(audit));
    }

    [Fact]
    public async Task SuspendUser_WhenMissing_ReturnsNotFoundAndWritesNothing()
    {
        var context = new Context();

        var outcome = await context.Service.SuspendUserAsync(
            context.AdminId,
            Guid.NewGuid(),
            null,
            CancellationToken.None);

        Assert.Equal(AdminOutcome.NotFound, outcome);
        Assert.Empty(context.Administration.AuditEntries);
        Assert.False(context.Kv.Values.ContainsKey(SuspendedUserService.KvKey));
    }

    [Fact]
    public async Task SuspendUser_WhenAlreadySuspended_StillRepublishesTheMap()
    {
        var context = new Context();
        var target = context.AddUser("suspended");

        var outcome = await context.Service.SuspendUserAsync(
            context.AdminId,
            target.Id,
            null,
            CancellationToken.None);

        Assert.Equal(AdminOutcome.Succeeded, outcome);
        Assert.Equal("suspended", target.Status);
        Assert.True(ReadSuspendedUsers(context.Kv).GetProperty(target.Id.ToString()).GetBoolean());
    }

    [Fact]
    public async Task SuspendUser_OmitsMetadataWhenNoReasonIsGiven()
    {
        var context = new Context();
        var target = context.AddUser("active");

        await context.Service.SuspendUserAsync(context.AdminId, target.Id, "   ", CancellationToken.None);

        Assert.Null(Assert.Single(context.Administration.AuditEntries).Metadata);
    }

    [Fact]
    public async Task ResumeUser_ActivatesUserAndClearsTheSuspendedMap()
    {
        var context = new Context();
        var target = context.AddUser("suspended");

        var outcome = await context.Service.ResumeUserAsync(
            context.AdminId,
            target.Id,
            null,
            CancellationToken.None);

        Assert.Equal(AdminOutcome.Succeeded, outcome);
        Assert.Equal("active", target.Status);
        Assert.Equal(0, ReadSuspendedUsers(context.Kv).GetPropertyCount());
        Assert.Equal("user.resume", Assert.Single(context.Administration.AuditEntries).Action);
    }

    [Fact]
    public async Task ResumeUser_WhenMissing_ReturnsNotFound()
    {
        var context = new Context();

        var outcome = await context.Service.ResumeUserAsync(
            context.AdminId,
            Guid.NewGuid(),
            null,
            CancellationToken.None);

        Assert.Equal(AdminOutcome.NotFound, outcome);
        Assert.Empty(context.Administration.AuditEntries);
    }

    [Fact]
    public async Task BlockDomain_NormalizesStoresAndPublishesTheDomain()
    {
        var context = new Context();

        var outcome = await context.Service.BlockDomainAsync(
            context.AdminId,
            "Mail.Spamco.co.UK",
            "phishing",
            CancellationToken.None);

        Assert.Equal(AdminOutcome.Succeeded, outcome);
        var stored = Assert.Single(context.Administration.Domains);
        Assert.Equal("spamco.co.uk", stored.DomainEtld1);
        Assert.Equal(context.AdminId, stored.AddedByAdminUserId);
        Assert.Equal("phishing", stored.Reason);
        Assert.Equal(Now, stored.CreatedAt);
        var domains = ReadBlockedDomains(context.Kv);
        Assert.Equal(["spamco.co.uk"], domains.EnumerateArray().Select(item => item.GetString()!).ToList());
        Assert.Equal("global_blocklist.add", Assert.Single(context.Administration.AuditEntries).Action);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task BlockDomain_WithInvalidDomain_ReturnsInvalid(string? domain)
    {
        var context = new Context();

        var outcome = await context.Service.BlockDomainAsync(context.AdminId, domain, null, CancellationToken.None);

        Assert.Equal(AdminOutcome.Invalid, outcome);
        Assert.Empty(context.Administration.Domains);
        Assert.Empty(context.Administration.AuditEntries);
        Assert.False(context.Kv.Values.ContainsKey(GlobalBlocklistService.KvKey));
    }

    [Fact]
    public async Task BlockDomain_WithOverlongDomain_ReturnsInvalid()
    {
        var context = new Context();
        var domain = $"{new string('a', 130)}.{new string('b', 130)}";

        var outcome = await context.Service.BlockDomainAsync(context.AdminId, domain, null, CancellationToken.None);

        Assert.Equal(AdminOutcome.Invalid, outcome);
        Assert.Empty(context.Administration.Domains);
    }

    [Fact]
    public async Task BlockDomain_WhenAlreadyBlocked_SucceedsWithoutDuplicatingTheEntry()
    {
        var context = new Context();

        await context.Service.BlockDomainAsync(context.AdminId, "spamco.ru", null, CancellationToken.None);
        var outcome = await context.Service.BlockDomainAsync(context.AdminId, "spamco.ru", null, CancellationToken.None);

        Assert.Equal(AdminOutcome.Succeeded, outcome);
        Assert.Single(context.Administration.Domains);
        Assert.Equal(1, ReadBlockedDomains(context.Kv).GetArrayLength());
    }

    [Fact]
    public async Task BlockDomain_DefaultsAndTruncatesTheStoredReason()
    {
        var context = new Context();

        await context.Service.BlockDomainAsync(context.AdminId, "first.example", null, CancellationToken.None);
        await context.Service.BlockDomainAsync(context.AdminId, "second.example", new string('r', 300), CancellationToken.None);

        var reasons = context.Administration.Domains.ToDictionary(domain => domain.DomainEtld1, domain => domain.Reason);
        Assert.Equal("administrator", reasons["first.example"]);
        Assert.Equal(256, reasons["second.example"].Length);
    }

    [Fact]
    public async Task UnblockDomain_RemovesTheRowAndRepublishesTheRemainingDomains()
    {
        var context = new Context();
        await context.Service.BlockDomainAsync(context.AdminId, "keep.ru", null, CancellationToken.None);
        await context.Service.BlockDomainAsync(context.AdminId, "drop.ru", null, CancellationToken.None);

        var outcome = await context.Service.UnblockDomainAsync(context.AdminId, "DROP.ru", CancellationToken.None);

        Assert.Equal(AdminOutcome.Succeeded, outcome);
        Assert.Equal(["keep.ru"], context.Administration.Domains.Select(domain => domain.DomainEtld1));
        var published = ReadBlockedDomains(context.Kv).EnumerateArray().Select(item => item.GetString()).ToList();
        Assert.Equal(["keep.ru"], published);
        Assert.Equal("global_blocklist.remove", context.Administration.AuditEntries[^1].Action);
    }

    [Fact]
    public async Task UnblockDomain_WhenNotBlocked_ReturnsNotFound()
    {
        var context = new Context();

        var outcome = await context.Service.UnblockDomainAsync(context.AdminId, "absent.ru", CancellationToken.None);

        Assert.Equal(AdminOutcome.NotFound, outcome);
        Assert.Empty(context.Administration.AuditEntries);
    }

    [Fact]
    public async Task UnblockDomain_WithInvalidDomain_ReturnsInvalid()
    {
        var context = new Context();

        var outcome = await context.Service.UnblockDomainAsync(context.AdminId, "  ", CancellationToken.None);

        Assert.Equal(AdminOutcome.Invalid, outcome);
    }

    [Fact]
    public async Task ListBlockedDomains_ReturnsOrderedNames()
    {
        var context = new Context();
        context.Administration.Seed(new GlobalBlockedDomain { DomainEtld1 = "zeta.ru", Reason = "x", CreatedAt = Now });
        context.Administration.Seed(new GlobalBlockedDomain { DomainEtld1 = "alpha.ru", Reason = "x", CreatedAt = Now });

        var domains = await context.Service.ListBlockedDomainsAsync(CancellationToken.None);

        Assert.Equal(["alpha.ru", "zeta.ru"], domains);
    }

    private static JsonElement ReadSuspendedUsers(InMemoryKvWriter kv) =>
        JsonDocument.Parse(kv.Values[SuspendedUserService.KvKey]).RootElement.GetProperty("users");

    private static JsonElement ReadBlockedDomains(InMemoryKvWriter kv) =>
        JsonDocument.Parse(kv.Values[GlobalBlocklistService.KvKey]).RootElement.GetProperty("domains");

    private static string? ReadMetadataReason(AdminAuditLogEntry entry) =>
        entry.Metadata is null
            ? null
            : JsonDocument.Parse(entry.Metadata).RootElement.GetProperty("reason").GetString();

    private sealed class Context
    {
        public Context()
        {
            Kv = new InMemoryKvWriter();
            Administration = new InMemoryAdministrationRepository();
            Accounts = new InMemoryAccountRepository { AutoCreateUsers = false };
            var timeProvider = new FixedTimeProvider(Now);
            Service = new AdministrationService(
                Accounts,
                Administration,
                new SuspendedUserService(Accounts, Kv),
                new GlobalBlocklistService(Administration, Kv),
                timeProvider);
            Admin = AddUser("active", isAdmin: true);
        }

        public Guid AdminId => Admin.Id;

        public InMemoryKvWriter Kv { get; }

        public InMemoryAdministrationRepository Administration { get; }

        public InMemoryAccountRepository Accounts { get; }

        public AdministrationService Service { get; }

        public PosternUser Admin { get; }

        public PosternUser AddUser(string status, bool isAdmin = false)
        {
            var user = new PosternUser
            {
                Id = Guid.NewGuid(),
                Email = $"{status}-{Guid.NewGuid():N}@example.test",
                NormalizedEmail = $"{status}-{Guid.NewGuid():N}@EXAMPLE.TEST".ToUpperInvariant(),
                PasswordHash = "hash",
                Status = status,
                IsAdmin = isAdmin,
                CreatedAt = Now
            };
            Accounts.Add(user);
            return user;
        }
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
