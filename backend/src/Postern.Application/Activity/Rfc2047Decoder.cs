using System.Text;
using System.Text.RegularExpressions;

namespace Postern.Application.Activity;

public static class Rfc2047Decoder
{
    private static readonly Regex EncodedWordRegex = new(
        @"=\?([^?]+)\?([BbQq])\?([^?]*)\?=",
        RegexOptions.Compiled,
        TimeSpan.FromSeconds(1));

    public static string Decode(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var unfolded = value.Replace("\r\n", " ").Replace("\n", " ").Replace("\r", " ");
        var result = EncodedWordRegex.Replace(unfolded, MatchEvaluator);
        return result.Trim();
    }

    private static string MatchEvaluator(Match match)
    {
        var charset = match.Groups[1].Value;
        var encoding = match.Groups[2].Value.ToUpperInvariant();
        var encodedText = match.Groups[3].Value;

        try
        {
            Encoding textEncoding;
            try
            {
                textEncoding = Encoding.GetEncoding(charset);
            }
            catch
            {
                textEncoding = Encoding.UTF8;
            }

            if (encoding == "B")
            {
                var bytes = Convert.FromBase64String(encodedText);
                return textEncoding.GetString(bytes);
            }

            if (encoding == "Q")
            {
                var decoded = DecodeQuotedPrintable(encodedText);
                return textEncoding.GetString(decoded);
            }
        }
        catch
        {
        }

        return match.Value;
    }

    private static byte[] DecodeQuotedPrintable(string input)
    {
        var bytes = new List<byte>(input.Length);
        for (var i = 0; i < input.Length; i++)
        {
            var c = input[i];
            if (c == '_')
            {
                bytes.Add((byte)' ');
                continue;
            }

            if (c == '=' && i + 2 < input.Length && IsHex(input[i + 1]) && IsHex(input[i + 2]))
            {
                var hex = input.Substring(i + 1, 2);
                bytes.Add(Convert.ToByte(hex, 16));
                i += 2;
                continue;
            }

            bytes.Add((byte)c);
        }

        return bytes.ToArray();
    }

    private static bool IsHex(char c) =>
        char.IsDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}
