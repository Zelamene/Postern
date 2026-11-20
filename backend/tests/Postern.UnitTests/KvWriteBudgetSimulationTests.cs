using System.Security.Cryptography;
using System.Text;
using Postern.Application.Accounts;
using Postern.Application.Activity;
using Postern.Application.Administration;
using Postern.Application.Aliases;
using Postern.Application.Integrations;
using Postern.Domain.Accounts;
using Postern.Domain.Administration;
using Postern.Domain.Aliases;
using Postern.UnitTests.Fakes;
using Xunit.Abstractions;

namespace Postern.UnitTests;

/// <summary>
/// QR3.2: the daily KV budget is owned by the API-side writers. This harness drives
/// the real publish, reconciliation and rate-limit services with an instrumented
/// <see cref="IKvWriter"/> and a clock advanced in five-minute steps, so a 24 h day
/// finishes in milliseconds without approximating any write path.
/// </summary>
[Collection("RateLimitService")]
public sealed class KvWriteBudgetSimulationTests(ITestOutputHelper output)
{
    private const int AccountCount = 199;
    private const int TicksPerDay = 24 * 12;
    private static readonly DateTimeOffset Start = new(2026, 11, 18, 0, 0, 0, TimeSpan.Zero);

    [Fact]
    public async Task Accelerated24HourSimulation_StaysBelowTheDailyWriteBudget()
    {
        var simulation = await BuildSimulationAsync();

        var initialWrites = await RunInitialFullSyncAsync(simulation);
        var day = await SimulateDayAsync(simulation);

        output.WriteLine(
            $"QR3.2 initial projection writes: {initialWrites}; " +
            $"24 h writes: {day.TotalWrites} " +
            $"(alias {day.AliasWrites}, rate-limit {day.RateLimitWrites}, maps {day.MapWrites}); " +
            $"ticks: {day.Ticks}; max writes per alias change: {day.MaxWritesPerChange}");

        Assert.Equal(TicksPerDay, day.Ticks);
        Assert.Equal(AccountCount, day.AliasWrites);
        Assert.True(day.TotalWrites < 1000, $"24 h writes were {day.TotalWrites}; the budget is < 1000.");
        Assert.True(
            initialWrites + day.TotalWrites < 1000,
            $"Projection plus 24 h writes were {initialWrites + day.TotalWrites}; the budget is < 1000.");
        Assert.True(
            day.MaxWritesPerChange <= 1,
            $"An alias change caused {day.MaxWritesPerChange} writes; the bound is 1.");
    }

    private static async Task<Simulation> BuildSimulationAsync()
    {
        var clock = new AdvancingClock(Start);
        var kv = new InstrumentedKvWriter(clock);
        var aliases = new InMemoryAliasRepository();
        var administration = new InMemoryAdministrationRepository(aliases);
        var accounts = new InMemoryAccountRepository { AutoCreateUsers = false };
        var activity = new InMemoryActivityRepository();
        var changes = new List<AliasChange>(AccountCount);

        for (var index = 1; index <= AccountCount; index++)
        {
            var id = index.ToString("D3");
            var userId = DeterministicGuid($"user-{id}");
            var aliasId = DeterministicGuid($"alias-{id}");
            var address = $"nfr-{id}-n{id}@postern.local";
            var email = $"nfr-user-{id}@example.test";

            var user = new PosternUser
            {
                Id = userId,
                Email = email,
                NormalizedEmail = email.ToUpperInvariant(),
                PasswordHash = "simulation-only",
                Status = index == AccountCount ? "suspended" : "active",
                CreatedAt = Start.AddDays(-1)
            };
            var alias = new Alias
            {
                Id = aliasId,
                UserId = userId,
                Label = $"nfr-{id}",
                RandomSuffix = $"n{id}",
                FullAddress = address,
                FullAddressHash = AddressHash(address),
                Status = AliasStatus.Active,
                KvDirty = true,
                CreatedAt = Start.AddDays(-1)
            };

            accounts.Add(user);
            aliases.Seed(alias);
            await aliases.MarkKvDirtyAsync(aliasId, CancellationToken.None);
            administration.Aliases.Add(new AdminKvSyncAlias(
                aliasId,
                address,
                userId,
                email,
                "active",
                Array.Empty<string>()));
            changes.Add(new AliasChange(ChangeTick(index), userId, aliasId, address));
        }

        administration.Seed(new GlobalBlockedDomain
        {
            DomainEtld1 = "qr32-spam.example",
            Reason = "seeded for the QR3.2 simulation",
            CreatedAt = Start.AddDays(-1)
        });

        return new Simulation(
            clock,
            kv,
            changes,
            new AdminKvSyncService(
                administration,
                aliases,
                new GlobalBlocklistService(administration, kv),
                new SuspendedUserService(accounts, kv),
                kv,
                clock),
            new AliasService(aliases, accounts, clock, kv, AliasPolicy.Default),
            new RateLimitService(activity, kv, clock));
    }

    private static async Task<int> RunInitialFullSyncAsync(Simulation simulation)
    {
        var before = simulation.Kv.Writes.Length;
        var result = await simulation.Sync.SyncAsync(null, CancellationToken.None, fullSync: true);

        Assert.Equal(AccountCount, result.AliasesSynced);
        Assert.Equal(0, result.AliasesFailed);
        Assert.True(result.GlobalBlocklistRebuilt);
        Assert.True(result.SuspendedUsersRebuilt);
        return simulation.Kv.Writes.Length - before;
    }

    private static async Task<SimulationDay> SimulateDayAsync(Simulation simulation)
    {
        var firstWriteIndex = simulation.Kv.Writes.Length;
        var maxWritesPerChange = 0;
        var ticks = 0;

        for (var tick = 1; tick <= TicksPerDay; tick++)
        {
            simulation.Clock.Advance(TimeSpan.FromMinutes(5));
            ticks++;

            foreach (var change in simulation.Changes.Where(item => item.Tick == tick))
            {
                var before = simulation.Kv.Writes.Length;
                Assert.True(await simulation.Aliases.DisableAsync(
                    change.UserId,
                    change.AliasId,
                    CancellationToken.None));

                var changeWrites = simulation.Kv.Writes.Length - before;
                maxWritesPerChange = Math.Max(maxWritesPerChange, changeWrites);
                Assert.True(
                    changeWrites <= 1,
                    $"{change.Key} caused {changeWrites} writes; the bound is 1 per alias change.");
            }

            await simulation.RateLimits.RebuildRateLimitedUsersAsync(CancellationToken.None);
        }

        await simulation.Sync.SyncAsync(null, CancellationToken.None, fullSync: false);

        var writes = simulation.Kv.Writes.Skip(firstWriteIndex).ToArray();
        var aliasKeys = simulation.Changes.Select(item => item.Key).ToHashSet(StringComparer.Ordinal);
        var aliasWrites = writes.Count(item => aliasKeys.Contains(item.Key));
        var rateLimitWrites = writes.Count(item => item.Key == RateLimitService.KvKey);
        var mapWrites = writes.Count(item => item.Key is GlobalBlocklistService.KvKey or SuspendedUserService.KvKey);
        var unexpectedWrites = writes.Length - aliasWrites - rateLimitWrites - mapWrites;

        Assert.Equal(0, unexpectedWrites);
        return new SimulationDay(
            writes.Length,
            aliasWrites,
            rateLimitWrites,
            mapWrites,
            maxWritesPerChange,
            ticks);
    }

    private static int ChangeTick(int index) => index * TicksPerDay / (AccountCount + 1);

    private static string AddressHash(string address) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(address)));

    private static Guid DeterministicGuid(string label)
    {
        var digest = SHA256.HashData(Encoding.UTF8.GetBytes($"postern-nfr:{label}"))[..16];
        digest[6] = (byte)((digest[6] & 0x0f) | 0x50);
        digest[8] = (byte)((digest[8] & 0x3f) | 0x80);
        return Guid.ParseExact(Convert.ToHexString(digest), "N");
    }

    private sealed record AliasChange(int Tick, Guid UserId, Guid AliasId, string Key);

    private sealed record SimulationDay(
        int TotalWrites,
        int AliasWrites,
        int RateLimitWrites,
        int MapWrites,
        int MaxWritesPerChange,
        int Ticks);

    private sealed record Simulation(
        AdvancingClock Clock,
        InstrumentedKvWriter Kv,
        IReadOnlyList<AliasChange> Changes,
        AdminKvSyncService Sync,
        AliasService Aliases,
        RateLimitService RateLimits);

    private sealed record KvWrite(DateTimeOffset At, string Operation, string Key);

    private sealed class AdvancingClock(DateTimeOffset start) : TimeProvider
    {
        private readonly object gate = new();
        private DateTimeOffset now = start;

        public override DateTimeOffset GetUtcNow()
        {
            lock (gate)
            {
                return now;
            }
        }

        public void Advance(TimeSpan amount)
        {
            lock (gate)
            {
                now += amount;
            }
        }
    }

    /// <summary>
    /// Counts every mutating KV call, including deletes of absent keys. Cloudflare bills
    /// the API call, so this is deliberately more conservative than counting state changes.
    /// </summary>
    private sealed class InstrumentedKvWriter(AdvancingClock clock) : IKvWriter
    {
        private readonly Dictionary<string, string> values = new(StringComparer.Ordinal);
        private readonly List<KvWrite> writes = [];

        public KvWrite[] Writes
        {
            get
            {
                lock (writes)
                {
                    return writes.ToArray();
                }
            }
        }

        public Task PutAsync(string key, string jsonValue, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            values[key] = jsonValue;
            Record("put", key);
            return Task.CompletedTask;
        }

        public Task DeleteAsync(string key, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            values.Remove(key);
            Record("delete", key);
            return Task.CompletedTask;
        }

        public Task<string?> GetAsync(string key, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult(values.GetValueOrDefault(key));
        }

        public Task<IReadOnlyCollection<string>> ListKeysAsync(CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult<IReadOnlyCollection<string>>(values.Keys.ToArray());
        }

        private void Record(string operation, string key)
        {
            lock (writes)
            {
                writes.Add(new KvWrite(clock.GetUtcNow(), operation, key));
            }
        }
    }
}
