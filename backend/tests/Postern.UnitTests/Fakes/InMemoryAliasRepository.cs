using Postern.Application.Aliases;
using Postern.Domain.Aliases;

namespace Postern.UnitTests.Fakes;

public sealed class InMemoryAliasRepository : IAliasRepository
{
    private readonly List<Alias> _aliases = [];
    private readonly List<ExpectedSender> _expectedSenders = [];
    private readonly HashSet<string> _tombstonedHashes = new(StringComparer.Ordinal);

    public IReadOnlyList<Alias> Aliases => _aliases;

    public List<Guid> KvDirtyAliasIds { get; } = [];

    public Func<string, bool>? TombstoneCheck { get; set; }

    public int TombstoneChecks { get; private set; }

    public void Seed(Alias alias) => _aliases.Add(alias);

    public void Tombstone(string fullAddressHash) => _tombstonedHashes.Add(fullAddressHash);

    public Task<Alias> CreateAsync(Alias alias, CancellationToken cancellationToken)
    {
        _aliases.Add(alias);
        return Task.FromResult(alias);
    }

    public Task<IReadOnlyCollection<Alias>> ListByUserAsync(Guid userId, CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyCollection<Alias>>(
            _aliases.Where(alias => alias.UserId == userId).ToList());

    public Task<Alias?> GetOwnedAliasAsync(Guid aliasId, Guid userId, CancellationToken cancellationToken) =>
        Task.FromResult(_aliases.SingleOrDefault(alias => alias.Id == aliasId && alias.UserId == userId));

    public Task<bool> UpdateStatusAsync(
        Guid aliasId,
        Guid userId,
        AliasStatus nextStatus,
        DateTimeOffset updatedAt,
        CancellationToken cancellationToken)
    {
        var alias = _aliases.SingleOrDefault(item => item.Id == aliasId && item.UserId == userId);
        if (alias is null)
        {
            return Task.FromResult(false);
        }

        alias.Status = nextStatus;
        return Task.FromResult(true);
    }

    public Task<bool> MarkReplacedAsync(
        Guid aliasId,
        Guid userId,
        Guid replacementAliasId,
        DateTimeOffset updatedAt,
        CancellationToken cancellationToken)
    {
        var alias = _aliases.SingleOrDefault(item => item.Id == aliasId && item.UserId == userId);
        if (alias is null)
        {
            return Task.FromResult(false);
        }

        alias.Status = AliasStatus.Replaced;
        alias.ReplacedByAliasId = replacementAliasId;
        return Task.FromResult(true);
    }

    public Task<bool> DeleteAsync(
        Guid aliasId,
        Guid userId,
        DateTimeOffset deletedAt,
        CancellationToken cancellationToken)
    {
        var alias = _aliases.SingleOrDefault(item => item.Id == aliasId && item.UserId == userId);
        if (alias is null)
        {
            return Task.FromResult(false);
        }

        alias.Status = AliasStatus.Deleted;
        alias.DeletedAt = deletedAt;
        return Task.FromResult(true);
    }

    public Task<bool> IsAddressHashTombstonedAsync(
        string fullAddressHash,
        CancellationToken cancellationToken)
    {
        TombstoneChecks++;
        return Task.FromResult(
            _tombstonedHashes.Contains(fullAddressHash)
            || (TombstoneCheck?.Invoke(fullAddressHash) ?? false));
    }

    public Task MarkKvDirtyAsync(Guid aliasId, CancellationToken cancellationToken)
    {
        KvDirtyAliasIds.Add(aliasId);
        return Task.CompletedTask;
    }

    public Task<IReadOnlyCollection<ExpectedSender>> ListExpectedSendersAsync(
        Guid aliasId,
        Guid userId,
        CancellationToken cancellationToken) =>
        Task.FromResult<IReadOnlyCollection<ExpectedSender>>(
            _expectedSenders.Where(sender => sender.AliasId == aliasId).ToList());

    public Task<ExpectedSender?> AddExpectedSenderAsync(
        Guid aliasId,
        Guid userId,
        string senderEtld1,
        DateTimeOffset createdAt,
        CancellationToken cancellationToken)
    {
        var existing = _expectedSenders.FirstOrDefault(sender =>
            sender.AliasId == aliasId && sender.SenderEtld1 == senderEtld1);
        if (existing is not null)
        {
            return Task.FromResult<ExpectedSender?>(existing);
        }

        var sender = new ExpectedSender
        {
            Id = Guid.NewGuid(),
            AliasId = aliasId,
            SenderEtld1 = senderEtld1,
            CreatedAt = createdAt
        };

        _expectedSenders.Add(sender);
        return Task.FromResult<ExpectedSender?>(sender);
    }

    public Task<bool> BlockSenderAsync(
        Guid aliasId,
        Guid userId,
        string senderEtld1,
        CancellationToken cancellationToken) =>
        Task.FromResult(true);

    public Task<IReadOnlyCollection<ExpectedSender>> CopyExpectedSendersAsync(
        Guid sourceAliasId,
        Guid targetAliasId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var copied = _expectedSenders
            .Where(sender => sender.AliasId == sourceAliasId)
            .Select(sender => new ExpectedSender
            {
                Id = Guid.NewGuid(),
                AliasId = targetAliasId,
                SenderEtld1 = sender.SenderEtld1,
                CreatedAt = sender.CreatedAt
            })
            .ToList();

        _expectedSenders.AddRange(copied);
        return Task.FromResult<IReadOnlyCollection<ExpectedSender>>(copied);
    }
}
