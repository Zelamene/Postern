using System.Text.Json;
using Postern.Application.Integrations;

namespace Postern.UnitTests;

public class AliasKvRecordTests
{
    [Fact]
    public void Serialize_WritesAnEmptyBlockedSenderListByDefault()
    {
        var userId = Guid.NewGuid();

        var payload = JsonDocument.Parse(
            AliasKvRecord.Serialize("inbox@example.test", "active", userId)).RootElement;

        Assert.Equal("inbox@example.test", payload.GetProperty("destination").GetString());
        Assert.Equal("active", payload.GetProperty("status").GetString());
        Assert.Equal(userId.ToString(), payload.GetProperty("userId").GetString());
        Assert.Empty(payload.GetProperty("blockedSenders").EnumerateArray());
    }

    [Fact]
    public void Serialize_NormalizesBlockedSenders()
    {
        var payload = JsonDocument.Parse(AliasKvRecord.Serialize(
                "inbox@example.test",
                "active",
                Guid.NewGuid(),
                ["spam.example", " ", "Abuse.Example", "spam.example"]))
            .RootElement;

        Assert.Equal(
            new[] { "Abuse.Example", "spam.example" },
            payload.GetProperty("blockedSenders").EnumerateArray().Select(item => item.GetString()));
    }
}
