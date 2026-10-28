using Postern.Application.Activity;

namespace Postern.UnitTests;

public class Rfc2047DecoderTests
{
    [Fact]
    public void DecodesUtf8Base64Subject()
    {
        var result = Rfc2047Decoder.Decode("=?UTF-8?B?SGVsbG8gV29ybGQh?=");
        Assert.Equal("Hello World!", result);
    }

    [Fact]
    public void DecodesUtf8QuotedPrintableSubject()
    {
        var result = Rfc2047Decoder.Decode("=?UTF-8?Q?Caf=C3=A9?=");
        Assert.Equal("Café", result);
    }

    [Fact]
    public void TruncatesAfterDecoding()
    {
        var result = Rfc2047Decoder.Decode("=?UTF-8?B?VGVzdA==?=");
        Assert.Equal("Test", result);
    }
}
