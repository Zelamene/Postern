using System.Text.Json;
using Postern.Application.Accounts;
using Postern.Application.Activity;
using Postern.Application.Administration;
using Postern.Application.Integrations;

namespace Postern.UnitTests;

/// <summary>
/// QR7.3: the API is one runtime that writes the KV contract. These tests read
/// shared/kv-records.json so the serializer cannot drift from the Worker that reads it.
/// The three map writers are checked against the same fixture in their own suites.
/// </summary>
public class KvRecordContractTests
{
    private static JsonElement Fixture() => SharedContractFixture.Load("kv-records.json");

    [Fact]
    public void AliasRecord_EmitsExactlyTheContractFields()
    {
        var contract = Fixture().GetProperty("aliasRecord");
        var userId = Guid.NewGuid();

        var payload = JsonDocument
            .Parse(AliasKvRecord.Serialize("inbox@example.test", "active", userId))
            .RootElement;

        SharedContractFixture.AssertEmitsDeclaredFields(payload, contract, "alias record");
        Assert.Equal("inbox@example.test", payload.GetProperty("destination").GetString());
        Assert.Equal(userId.ToString(), payload.GetProperty("userId").GetString());
    }

    [Fact]
    public void AliasRecord_NormalizesBlockedSendersAsTheContractStates()
    {
        var contract = Fixture().GetProperty("aliasRecord");
        var input = contract.GetProperty("normalizationInput")
            .EnumerateArray()
            .Select(value => value.GetString()!)
            .ToArray();
        var expected = contract.GetProperty("normalizationOutput")
            .EnumerateArray()
            .Select(value => value.GetString()!)
            .ToArray();

        var payload = JsonDocument
            .Parse(AliasKvRecord.Serialize("inbox@example.test", "active", Guid.NewGuid(), input))
            .RootElement;

        Assert.Equal(
            expected,
            payload.GetProperty("blockedSenders").EnumerateArray().Select(value => value.GetString()));
    }

    [Fact]
    public void MapDeclarations_UseTheProductionKeyNames()
    {
        var maps = Fixture().GetProperty("maps");

        Assert.True(maps.TryGetProperty(GlobalBlocklistService.KvKey, out _));
        Assert.True(maps.TryGetProperty(SuspendedUserService.KvKey, out _));
        Assert.True(maps.TryGetProperty(RateLimitService.KvKey, out _));
    }
}
