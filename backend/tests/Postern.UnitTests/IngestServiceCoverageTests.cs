using Postern.Application.Activity;
using Postern.Domain.Activity;
using Postern.Domain.Aliases;
using Postern.UnitTests.Fakes;

namespace Postern.UnitTests;

public class IngestServiceCoverageTests
{
    private static readonly DateTimeOffset Now = new(2026, 11, 1, 12, 0, 0, TimeSpan.Zero);

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task Ingest_MissingRecipient_ReturnsDropped(string? recipient)
    {
        var service = new IngestService(new InMemoryActivityRepository(), new FixedTimeProvider(Now));
        var result = await service.IngestAsync(recipient!, "s", "f", "sub", "pass", CancellationToken.None);
        Assert.Equal(IngestResult.Dropped, result);
    }

    [Fact]
    public async Task Ingest_Blocked_NormalizesAndTruncatesReason()
    {
        var repo = new InMemoryActivityRepository();
        var alias = CreateAlias(AliasStatus.Active);
        repo.AddAlias(alias);
        var service = new IngestService(repo, new FixedTimeProvider(Now));

        var result = await service.IngestAsync(alias.FullAddress!, "s", "f", "sub", "pass", CancellationToken.None, blocked: true, reason: "  " + new string('r', 50));

        Assert.Equal(IngestResult.Blocked, result);
        Assert.Equal(32, repo.BlockedMessages.Single().Reason.Length);
    }

    [Fact]
    public async Task Ingest_Blocked_DefaultReason()
    {
        var repo = new InMemoryActivityRepository();
        var alias = CreateAlias(AliasStatus.Active);
        repo.AddAlias(alias);
        var service = new IngestService(repo, new FixedTimeProvider(Now));

        await service.IngestAsync(alias.FullAddress!, "s", "f", "sub", "pass", CancellationToken.None, blocked: true, reason: null);

        Assert.Equal("blocked", repo.BlockedMessages.Single().Reason);
    }

    [Fact]
    public async Task Ingest_Active_NoExpectedSenders_PassWithDomain_AddsExpectedSender()
    {
        var repo = new InMemoryActivityRepository();
        var alias = CreateAlias(AliasStatus.Active);
        repo.AddAlias(alias);
        var service = new IngestService(repo, new FixedTimeProvider(Now));

        var result = await service.IngestAsync(alias.FullAddress!, "s", "Sender <user@example.com>", "sub", "pass", CancellationToken.None);

        Assert.Equal(IngestResult.Accepted, result);
        Assert.Single(repo.AddedExpectedSenders);
    }

    [Fact]
    public async Task Ingest_Active_NoExpectedSenders_UnknownAuth_FlagsUnknown()
    {
        var repo = new InMemoryActivityRepository();
        var alias = CreateAlias(AliasStatus.Active);
        repo.AddAlias(alias);
        var service = new IngestService(repo, new FixedTimeProvider(Now));

        await service.IngestAsync(alias.FullAddress!, "s", "Sender <user@example.com>", "sub", "weird", CancellationToken.None);

        var msg = Assert.Single(repo.Messages);
        Assert.Equal("unknown", msg.AuthenticationResult);
        Assert.True(msg.IsFlagged);
        Assert.Equal("unknown", msg.FlagReason);
    }

    [Fact]
    public async Task Ingest_TruncatesOverlongSubjectAndHeader()
    {
        var repo = new InMemoryActivityRepository();
        var alias = CreateAlias(AliasStatus.Active);
        repo.AddAlias(alias);
        var service = new IngestService(repo, new FixedTimeProvider(Now));

        await service.IngestAsync(alias.FullAddress!, "s", "F <f@example.com>" + new string('x', 1200), new string('s', 100), "pass", CancellationToken.None);

        var msg = Assert.Single(repo.Messages);
        Assert.Equal(998, msg.FromHeader.Length);
        Assert.Equal(60, msg.Subject!.Length);
    }

    [Fact]
    public async Task Ingest_WhitespaceSubject_BecomesNull()
    {
        var repo = new InMemoryActivityRepository();
        var alias = CreateAlias(AliasStatus.Active);
        repo.AddAlias(alias);
        var service = new IngestService(repo, new FixedTimeProvider(Now));

        await service.IngestAsync(alias.FullAddress!, "s", "f@example.com", "   ", "pass", CancellationToken.None);

        Assert.Null(repo.Messages.Single().Subject);
    }

    private static Alias CreateAlias(AliasStatus status)
    {
        var address = $"test-{Guid.NewGuid():N}@postern.local";
        return new Alias
        {
            Id = Guid.NewGuid(),
            UserId = Guid.NewGuid(),
            Label = "test",
            RandomSuffix = "abcd1234",
            FullAddress = address,
            FullAddressHash = Postern.Application.Aliases.AliasService.HashAddress(address.Trim().ToLowerInvariant()),
            Status = status,
            CreatedAt = Now,
            KvDirty = false
        };
    }

    private sealed class FixedTimeProvider(DateTimeOffset now) : TimeProvider
    {
        public override DateTimeOffset GetUtcNow() => now;
    }
}
