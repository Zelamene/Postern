using Postern.Application.Activity;

namespace Postern.UnitTests;

public sealed class ActivityCursorTests
{
    [Fact]
    public void EncodeAndDecodeRoundTripsTimestampAndIdentifier()
    {
        var receivedAt = new DateTimeOffset(2026, 10, 29, 8, 15, 30, 123, TimeSpan.Zero).AddTicks(4567);
        var id = Guid.NewGuid();

        var encoded = ActivityCursor.Encode(receivedAt, id);

        Assert.True(ActivityCursor.TryDecode(encoded, out var decoded));
        Assert.Equal(receivedAt, decoded.ReceivedAt);
        Assert.Equal(id, decoded.Id);
    }

    [Fact]
    public void EncodeProducesUrlSafeToken()
    {
        var encoded = ActivityCursor.Encode(DateTimeOffset.UtcNow, Guid.NewGuid());

        Assert.DoesNotContain('+', encoded);
        Assert.DoesNotContain('/', encoded);
        Assert.DoesNotContain('=', encoded);
    }

    [Fact]
    public void EncodeNormalizesOffsetToTheSameInstant()
    {
        var instant = new DateTimeOffset(2026, 10, 29, 8, 15, 30, TimeSpan.Zero);
        var withOffset = instant.ToOffset(TimeSpan.FromHours(2));

        Assert.True(ActivityCursor.TryDecode(ActivityCursor.Encode(withOffset, Guid.NewGuid()), out var decoded));
        Assert.Equal(instant, decoded.ReceivedAt);
        Assert.Equal(TimeSpan.Zero, decoded.ReceivedAt.Offset);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not base64 at all!!")]
    [InlineData("bm90LWEtY3Vyc29y")]
    public void DecodeRejectsMissingOrMalformedCursors(string? value)
    {
        Assert.False(ActivityCursor.TryDecode(value, out _));
    }

    [Fact]
    public void DecodeRejectsCursorWithoutIdentifier()
    {
        var payload = Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes("639000000000000000:"));
        Assert.False(ActivityCursor.TryDecode(payload, out _));
    }

    [Theory]
    [InlineData(null, ActivityService.DefaultPageSize)]
    [InlineData(0, ActivityService.DefaultPageSize)]
    [InlineData(-5, ActivityService.DefaultPageSize)]
    [InlineData(10, 10)]
    [InlineData(ActivityService.MaximumPageSize, ActivityService.MaximumPageSize)]
    [InlineData(10_000, ActivityService.MaximumPageSize)]
    public void PageSizeIsClampedToTheSupportedRange(int? requested, int expected)
    {
        Assert.Equal(expected, ActivityService.NormalizePageSize(requested));
    }

    [Fact]
    public void RetentionWindowIsNinetyDays()
    {
        Assert.Equal(TimeSpan.FromDays(90), ActivityService.RetentionWindow);
    }
}
