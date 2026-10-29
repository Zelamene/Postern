using System.Globalization;
using System.Text;

namespace Postern.Application.Activity;


public readonly record struct ActivityCursor(DateTimeOffset ReceivedAt, Guid Id)
{
    public static string Encode(DateTimeOffset receivedAt, Guid id)
    {
        var payload = string.Create(
            CultureInfo.InvariantCulture,
            $"{receivedAt.UtcTicks}:{id:N}");
        return Convert.ToBase64String(Encoding.UTF8.GetBytes(payload))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    public static bool TryDecode(string? value, out ActivityCursor cursor)
    {
        cursor = default;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        try
        {
            var padded = value.Replace('-', '+').Replace('_', '/');
            var remainder = padded.Length % 4;
            if (remainder != 0)
            {
                padded = padded.PadRight(padded.Length + (4 - remainder), '=');
            }

            var payload = Encoding.UTF8.GetString(Convert.FromBase64String(padded));
            var separator = payload.IndexOf(':');
            if (separator <= 0 || separator == payload.Length - 1)
            {
                return false;
            }

            if (!long.TryParse(
                    payload[..separator],
                    NumberStyles.None,
                    CultureInfo.InvariantCulture,
                    out var utcTicks)
                || utcTicks < DateTimeOffset.MinValue.UtcTicks
                || utcTicks > DateTimeOffset.MaxValue.UtcTicks)
            {
                return false;
            }

            if (!Guid.TryParseExact(payload[(separator + 1)..], "N", out var id))
            {
                return false;
            }

            cursor = new ActivityCursor(new DateTimeOffset(utcTicks, TimeSpan.Zero), id);
            return true;
        }
        catch (FormatException)
        {
            return false;
        }
    }
}
