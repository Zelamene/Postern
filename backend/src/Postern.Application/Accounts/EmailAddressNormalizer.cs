using System.Globalization;
using System.Net;
using System.Net.Sockets;
using System.Text;

namespace Postern.Application.Accounts;

public static class EmailAddressNormalizer
{
    private const int MaximumLocalPartBytes = 64;
    private const int MaximumDomainBytes = 255;
    private const int MaximumAddressBytes = 320;
    private const string AllowedAtomPunctuation = "!#$%&'*+/=?^_`{|}~-";
    private static readonly IdnMapping Idn = new() { UseStd3AsciiRules = true };
    private static readonly HashSet<int> IgnoredCodePoints =
    [
        0x00AD,
        0x200B,
        0x2060,
        0xFEFF,
        .. Enumerable.Range(0xFE00, 16)
    ];

    public static bool TryNormalize(string? email, out string normalizedEmail)
    {
        normalizedEmail = string.Empty;
        if (string.IsNullOrWhiteSpace(email))
        {
            return false;
        }

        string cleaned;
        try
        {
            cleaned = RemoveIgnoredCharacters(email.Trim().Replace('\uFF20', '@'))
                .Normalize(NormalizationForm.FormC);
        }
        catch (ArgumentException)
        {
            return false;
        }

        var separator = cleaned.LastIndexOf('@');
        if (separator <= 0 || separator == cleaned.Length - 1)
        {
            return false;
        }

        var localPart = cleaned[..separator];
        var domain = NormalizeDomainSeparators(cleaned[(separator + 1)..]);
        if (!IsValidLocalPart(localPart))
        {
            return false;
        }

        string normalizedDomain;
        if (domain.StartsWith("[", StringComparison.Ordinal)
            && domain.EndsWith("]", StringComparison.Ordinal))
        {
            if (!IsValidAddressLiteral(domain))
            {
                return false;
            }

            normalizedDomain = domain;
        }
        else if (!TryNormalizeDomain(domain, out normalizedDomain))
        {
            return false;
        }

        var asciiDomain = normalizedDomain.StartsWith("[", StringComparison.Ordinal)
            ? normalizedDomain
            : GetAsciiDomain(normalizedDomain);
        if (asciiDomain is null
            || Encoding.ASCII.GetByteCount(asciiDomain) > MaximumDomainBytes
            || Encoding.UTF8.GetByteCount(localPart) + 1 + Encoding.ASCII.GetByteCount(asciiDomain)
                > MaximumAddressBytes)
        {
            return false;
        }

        normalizedEmail = $"{localPart}@{normalizedDomain}";
        return true;
    }

    public static string NormalizeIdentity(string email)
    {
        if (!TryNormalize(email, out var normalizedEmail))
        {
            throw new ArgumentException("The email address is invalid.", nameof(email));
        }

        var separator = normalizedEmail.LastIndexOf('@');
        var localPart = normalizedEmail[..separator].Normalize(NormalizationForm.FormC);
        var domain = normalizedEmail[(separator + 1)..];
        var asciiDomain = domain.StartsWith("[", StringComparison.Ordinal)
            ? domain
            : GetAsciiDomain(domain)
                ?? throw new ArgumentException("The email domain is invalid.", nameof(email));

        return $"{localPart.ToUpperInvariant()}@{asciiDomain.ToLowerInvariant()}";
    }

    private static string RemoveIgnoredCharacters(string value)
    {
        var result = new StringBuilder(value.Length);
        foreach (var rune in value.EnumerateRunes())
        {
            if (IgnoredCodePoints.Contains(rune.Value))
            {
                continue;
            }

            result.Append(Rune.GetUnicodeCategory(rune) == UnicodeCategory.SpaceSeparator
                ? " "
                : rune.ToString());
        }

        return result.ToString();
    }

    private static string NormalizeDomainSeparators(string domain) =>
        domain.Replace('\u3002', '.')
            .Replace('\uFF0E', '.')
            .Replace('\uFF61', '.')
            .Normalize(NormalizationForm.FormC);

    private static bool IsValidLocalPart(string localPart)
    {
        if (Encoding.UTF8.GetByteCount(localPart) > MaximumLocalPartBytes)
        {
            return false;
        }

        if (localPart.StartsWith("\"", StringComparison.Ordinal))
        {
            return IsValidQuotedLocalPart(localPart);
        }

        var hasCharacterInAtom = false;
        foreach (var rune in localPart.EnumerateRunes())
        {
            if (rune.Value == '.')
            {
                if (!hasCharacterInAtom)
                {
                    return false;
                }

                hasCharacterInAtom = false;
                continue;
            }

            if (!IsValidAtomCharacter(rune))
            {
                return false;
            }

            hasCharacterInAtom = true;
        }

        return hasCharacterInAtom;
    }

    private static bool IsValidQuotedLocalPart(string localPart)
    {
        var runes = localPart.EnumerateRunes().ToArray();
        if (runes.Length < 2 || runes[0].Value != '"' || runes[^1].Value != '"')
        {
            return false;
        }

        for (var index = 1; index < runes.Length - 1; index++)
        {
            var rune = runes[index];
            if (rune.Value == '\\')
            {
                index++;
                if (index >= runes.Length - 1 || IsProhibitedQuotedCharacter(runes[index]))
                {
                    return false;
                }

                continue;
            }

            if (rune.Value == '"' || IsProhibitedQuotedCharacter(rune))
            {
                return false;
            }
        }

        return true;
    }

    private static bool IsProhibitedQuotedCharacter(Rune rune)
    {
        var category = Rune.GetUnicodeCategory(rune);
        return category is UnicodeCategory.Control
            or UnicodeCategory.LineSeparator
            or UnicodeCategory.ParagraphSeparator;
    }

    private static bool IsValidAtomCharacter(Rune rune)
    {
        if (rune.IsAscii)
        {
            return char.IsAsciiLetterOrDigit((char)rune.Value)
                || AllowedAtomPunctuation.Contains((char)rune.Value);
        }

        var category = Rune.GetUnicodeCategory(rune);
        return category is UnicodeCategory.UppercaseLetter
            or UnicodeCategory.LowercaseLetter
            or UnicodeCategory.TitlecaseLetter
            or UnicodeCategory.ModifierLetter
            or UnicodeCategory.OtherLetter
            or UnicodeCategory.NonSpacingMark
            or UnicodeCategory.SpacingCombiningMark
            or UnicodeCategory.EnclosingMark
            or UnicodeCategory.DecimalDigitNumber
            or UnicodeCategory.LetterNumber
            or UnicodeCategory.OtherNumber
            or UnicodeCategory.ConnectorPunctuation;
    }

    private static bool TryNormalizeDomain(string domain, out string normalizedDomain)
    {
        normalizedDomain = string.Empty;
        var labels = domain.Split('.');
        if (labels.Length < 2 || labels.Any(string.IsNullOrEmpty))
        {
            return false;
        }

        var asciiLabels = new string[labels.Length];
        for (var index = 0; index < labels.Length; index++)
        {
            if (!IsValidDomainLabel(labels[index]))
            {
                return false;
            }

            try
            {
                var asciiLabel = Idn.GetAscii(labels[index]);
                var unicodeLabel = Idn.GetUnicode(asciiLabel);
                if (asciiLabel.Length is 0 or > 63
                    || asciiLabel[0] == '-'
                    || asciiLabel[^1] == '-'
                    || (asciiLabel.Length >= 4
                        && asciiLabel[2] == '-'
                        && asciiLabel[3] == '-'
                        && !asciiLabel.StartsWith("xn--", StringComparison.OrdinalIgnoreCase))
                    || !asciiLabel.All(character =>
                        char.IsAsciiLetterOrDigit(character) || character == '-')
                    || !string.Equals(
                        Idn.GetAscii(unicodeLabel),
                        asciiLabel,
                        StringComparison.OrdinalIgnoreCase))
                {
                    return false;
                }

                asciiLabels[index] = asciiLabel.ToLowerInvariant();
                labels[index] = unicodeLabel.Normalize(NormalizationForm.FormC);
            }
            catch (ArgumentException)
            {
                return false;
            }
        }

        if (!IsValidTopLevelLabel(labels[^1]))
        {
            return false;
        }

        if (!AreBidiLabelsValid(labels))
        {
            return false;
        }

        var asciiDomain = string.Join('.', asciiLabels);
        if (Encoding.ASCII.GetByteCount(asciiDomain) > MaximumDomainBytes)
        {
            return false;
        }

        normalizedDomain = string.Join('.', labels);
        return true;
    }

    private static bool IsValidDomainLabel(string label)
    {
        var runes = label.EnumerateRunes().ToArray();
        return runes.Length > 0
            && runes[0].Value != '-'
            && runes[^1].Value != '-'
            && runes.All(rune =>
            {
                if (rune.Value == '-')
                {
                    return true;
                }

                var category = Rune.GetUnicodeCategory(rune);
                return category is UnicodeCategory.UppercaseLetter
                    or UnicodeCategory.LowercaseLetter
                    or UnicodeCategory.TitlecaseLetter
                    or UnicodeCategory.ModifierLetter
                    or UnicodeCategory.OtherLetter
                    or UnicodeCategory.NonSpacingMark
                    or UnicodeCategory.SpacingCombiningMark
                    or UnicodeCategory.EnclosingMark
                    or UnicodeCategory.DecimalDigitNumber
                    or UnicodeCategory.LetterNumber
                    or UnicodeCategory.OtherNumber;
            });
    }

    private static bool IsValidTopLevelLabel(string label)
    {
        var runes = label.EnumerateRunes().ToArray();
        return runes.Length >= 2
            && runes.All(rune =>
            {
                var category = Rune.GetUnicodeCategory(rune);
                return category is UnicodeCategory.UppercaseLetter
                    or UnicodeCategory.LowercaseLetter
                    or UnicodeCategory.TitlecaseLetter
                    or UnicodeCategory.ModifierLetter
                    or UnicodeCategory.OtherLetter
                    or UnicodeCategory.NonSpacingMark
                    or UnicodeCategory.SpacingCombiningMark
                    or UnicodeCategory.EnclosingMark;
            });
    }

    private static bool AreBidiLabelsValid(IEnumerable<string> labels)
    {
        var directions = labels
            .Select(label => label.EnumerateRunes().Select(GetBidiClass).ToArray())
            .ToArray();
        if (!directions.SelectMany(label => label).Any(IsRightToLeft))
        {
            return true;
        }

        return directions.All(label =>
        {
            if (label.Length == 0
                || label[0] is not (BidiClass.LeftToRight
                    or BidiClass.RightToLeft
                    or BidiClass.ArabicLetter))
            {
                return false;
            }

            var isRightToLeft = label[0] is BidiClass.RightToLeft or BidiClass.ArabicLetter;
            var allowedDirections = isRightToLeft
                ? RightToLeftBidiClasses
                : LeftToRightBidiClasses;
            if (label.Any(direction => !allowedDirections.Contains(direction)))
            {
                return false;
            }

            var lastDirectionIndex = Array.FindLastIndex(
                label,
                direction => direction != BidiClass.NonspacingMark);
            if (lastDirectionIndex < 0)
            {
                return false;
            }

            var lastDirection = label[lastDirectionIndex];
            return isRightToLeft
                ? lastDirection is BidiClass.RightToLeft
                    or BidiClass.ArabicLetter
                    or BidiClass.EuropeanNumber
                    or BidiClass.ArabicNumber
                    && !(label.Contains(BidiClass.EuropeanNumber)
                        && label.Contains(BidiClass.ArabicNumber))
                : lastDirection is BidiClass.LeftToRight or BidiClass.EuropeanNumber;
        });
    }

    private static readonly HashSet<BidiClass> RightToLeftBidiClasses =
    [
        BidiClass.RightToLeft,
        BidiClass.ArabicLetter,
        BidiClass.ArabicNumber,
        BidiClass.EuropeanNumber,
        BidiClass.EuropeanSeparator,
        BidiClass.OtherNeutral,
        BidiClass.NonspacingMark
    ];

    private static readonly HashSet<BidiClass> LeftToRightBidiClasses =
    [
        BidiClass.LeftToRight,
        BidiClass.EuropeanNumber,
        BidiClass.EuropeanSeparator,
        BidiClass.OtherNeutral,
        BidiClass.NonspacingMark
    ];

    private static bool IsRightToLeft(BidiClass bidiClass) =>
        bidiClass is BidiClass.RightToLeft or BidiClass.ArabicLetter or BidiClass.ArabicNumber;

    private static BidiClass GetBidiClass(Rune rune)
    {
        var codePoint = rune.Value;
        var category = Rune.GetUnicodeCategory(rune);
        if (category is UnicodeCategory.NonSpacingMark
            or UnicodeCategory.SpacingCombiningMark
            or UnicodeCategory.EnclosingMark)
        {
            return BidiClass.NonspacingMark;
        }

        if (codePoint == '-')
        {
            return BidiClass.EuropeanSeparator;
        }

        if (codePoint is >= '0' and <= '9' or >= 0x06F0 and <= 0x06F9)
        {
            return BidiClass.EuropeanNumber;
        }

        if (codePoint is >= 0x0660 and <= 0x0669)
        {
            return BidiClass.ArabicNumber;
        }

        if (IsArabicScript(codePoint))
        {
            return BidiClass.ArabicLetter;
        }

        if (IsRightToLeftScript(codePoint))
        {
            return BidiClass.RightToLeft;
        }

        if (category is UnicodeCategory.UppercaseLetter
            or UnicodeCategory.LowercaseLetter
            or UnicodeCategory.TitlecaseLetter
            or UnicodeCategory.ModifierLetter
            or UnicodeCategory.OtherLetter)
        {
            return BidiClass.LeftToRight;
        }

        return BidiClass.OtherNeutral;
    }

    private static bool IsArabicScript(int codePoint) =>
        codePoint is >= 0x0600 and <= 0x06FF
            or >= 0x0750 and <= 0x077F
            or >= 0x08A0 and <= 0x08FF
            or >= 0xFB50 and <= 0xFDFF
            or >= 0xFE70 and <= 0xFEFF
            or >= 0x1EE00 and <= 0x1EEFF;

    private static bool IsRightToLeftScript(int codePoint) =>
        codePoint is >= 0x0590 and <= 0x05FF
            or >= 0x0700 and <= 0x074F
            or >= 0x0780 and <= 0x07BF
            or >= 0x07C0 and <= 0x085F
            or >= 0x10840 and <= 0x108FF
            or >= 0x10900 and <= 0x1091F
            or >= 0x10A00 and <= 0x10AFF
            or >= 0x10B00 and <= 0x10B8F
            or >= 0x10C00 and <= 0x10CFF
            or >= 0x10D00 and <= 0x10D3F
            or >= 0x10E80 and <= 0x10EBF
            or >= 0x10F00 and <= 0x10FAF
            or >= 0x1E800 and <= 0x1E8DF
            or >= 0x1E900 and <= 0x1E95F
            or >= 0xFB1D and <= 0xFB4F;

    private enum BidiClass
    {
        LeftToRight,
        RightToLeft,
        ArabicLetter,
        ArabicNumber,
        EuropeanNumber,
        EuropeanSeparator,
        OtherNeutral,
        NonspacingMark
    }

    private static bool IsValidAddressLiteral(string domain)
    {
        var literal = domain[1..^1];
        if (literal.StartsWith("IPv6:", StringComparison.OrdinalIgnoreCase))
        {
            var address = literal[5..];
            return !address.Contains('%')
                && IPAddress.TryParse(address, out var parsedAddress)
                && parsedAddress.AddressFamily == AddressFamily.InterNetworkV6;
        }

        var parts = literal.Split('.');
        if (parts.Length != 4)
        {
            return false;
        }

        foreach (var part in parts)
        {
            if (part.Length is 0 or > 3
                || (part.Length > 1 && part[0] == '0')
                || !byte.TryParse(part, NumberStyles.None, CultureInfo.InvariantCulture, out _))
            {
                return false;
            }
        }

        return IPAddress.TryParse(literal, out var ipv4Address)
            && ipv4Address.AddressFamily == AddressFamily.InterNetwork;
    }

    private static string? GetAsciiDomain(string domain)
    {
        try
        {
            return string.Join('.', domain.Split('.').Select(label => Idn.GetAscii(label)));
        }
        catch (ArgumentException)
        {
            return null;
        }
    }
}
