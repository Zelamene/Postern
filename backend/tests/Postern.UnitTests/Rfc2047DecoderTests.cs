using Postern.Application.Activity;

namespace Postern.UnitTests;

public class Rfc2047DecoderTests
{
    [Theory]
    [InlineData("hello", "hello")]
    [InlineData("", "")]
    public void Decode_PlainText_ReturnsAsIs(string input, string expected)
    {
        var result = Rfc2047Decoder.Decode(input);
        Assert.Equal(expected, result);
    }

    [Fact]
    public void Decode_Null_ReturnsEmpty()
    {
        var result = Rfc2047Decoder.Decode(null!);
        Assert.Equal(string.Empty, result);
    }

    [Fact]
    public void Decode_EncodedWord_ReturnsDecoded()
    {
        var result = Rfc2047Decoder.Decode("=?UTF-8?B?aGVsbG8=?=");
        Assert.Contains("hello", result);
    }
}
