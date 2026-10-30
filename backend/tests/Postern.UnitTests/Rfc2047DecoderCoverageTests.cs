using System.Text;
using Postern.Application.Activity;

namespace Postern.UnitTests;

public class Rfc2047DecoderCoverageTests
{
    [Fact]
    public void Decode_QuotedPrintable_DecodesUtf8Bytes()
    {
        Assert.Equal("café", Rfc2047Decoder.Decode("=?UTF-8?Q?caf=C3=A9?="));
    }

    [Fact]
    public void Decode_QuotedPrintable_TreatsUnderscoreAsSpace()
    {
        Assert.Equal("hello world", Rfc2047Decoder.Decode("=?UTF-8?Q?hello_world?="));
    }

    [Fact]
    public void Decode_QuotedPrintable_KeepsLiteralCharactersWithoutEscape()
    {
        Assert.Equal("50% off = 3 days", Rfc2047Decoder.Decode("=?UTF-8?Q?50% off = 3 days?="));
    }

    [Fact]
    public void Decode_QuotedPrintable_TrailingEqualsIsLiteral()
    {
        Assert.Equal("abc=", Rfc2047Decoder.Decode("=?UTF-8?Q?abc=?="));
    }

    [Fact]
    public void Decode_MultipleEncodedWords_DecodesAll()
    {
        var result = Rfc2047Decoder.Decode("=?UTF-8?B?SGVsbG8=?=,=?UTF-8?Q?_there?=");

        Assert.Equal("Hello, there", result);
    }

    [Fact]
    public void Decode_FoldedHeader_UnfoldsBeforeDecoding()
    {
        var result = Rfc2047Decoder.Decode("line one\r\nline two\nline three");

        Assert.Equal("line one line two line three", result);
    }

    [Fact]
    public void Decode_UnknownCharset_FallsBackToUtf8()
    {
        var result = Rfc2047Decoder.Decode("=?X-UNKNOWN-CHARSET?B?SGVsbG8=?=");

        Assert.Equal("Hello", result);
    }

    [Fact]
    public void Decode_Latin1Charset_UsesDeclaredEncoding()
    {
        var latin1 = Convert.ToBase64String(Encoding.Latin1.GetBytes("café"));

        Assert.Equal("café", Rfc2047Decoder.Decode($"=?ISO-8859-1?B?{latin1}?="));
    }

    [Theory]
    [InlineData("=?UTF-8?B?not-valid-base64!!?=")]
    [InlineData("=?UTF-8?X?dGhpcyBpcyBub3QgYSBrbm93biBlbmNvZGluZw==?=")]
    public void Decode_UndecodableWord_ReturnsOriginalToken(string input)
    {
        Assert.Equal(input, Rfc2047Decoder.Decode(input));
    }

    [Fact]
    public void Decode_WhitespaceOnly_ReturnsEmpty()
    {
        Assert.Equal(string.Empty, Rfc2047Decoder.Decode("   "));
    }

    [Fact]
    public void Decode_TrimsSurroundingWhitespace()
    {
        Assert.Equal("hello", Rfc2047Decoder.Decode("   hello   "));
    }

    [Fact]
    public void Decode_PlainTextWithQuestionMark_LeavesItUntouched()
    {
        Assert.Equal("is this it?", Rfc2047Decoder.Decode("is this it?"));
    }
}
