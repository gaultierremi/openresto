using System.Globalization;
using OpenRestoApi.Core.Application.Exceptions;

namespace OpenRestoApi.Core.Application.Utilities;

/// <summary>
/// The Belgian enterprise number (BCE/KBO): ten digits starting with 0 or 1, the last two being
/// <c>97 - (first eight mod 97)</c>. The VAT number is the same ten digits behind <c>BE</c>, so one
/// check serves both and a typo is caught before it reaches a legal notice.
/// </summary>
/// <seealso>BelgianBusinessNumberTests.Normalize_AcceptsTheWaysPeopleWriteAValidNumber</seealso>
/// <seealso>BelgianBusinessNumberTests.Normalize_RefusesAWrongCheckDigit</seealso>
public static class BelgianBusinessNumber
{
    private const int Length = 10;

    /// <summary>The ten digits, or null when <paramref name="input"/> is not a valid number.</summary>
    public static string? TryDigits(string? input)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return null;
        }

        string text = input.Trim();
        if (text.StartsWith("BE", StringComparison.OrdinalIgnoreCase))
        {
            text = text[2..];
        }

        string digits = new([.. text.Where(c => c is not ('.' or ' ' or '-'))]);
        if (digits.Length != Length || !digits.All(char.IsAsciiDigit) || digits[0] is not ('0' or '1'))
        {
            return null;
        }

        int body = int.Parse(digits.AsSpan(0, 8), CultureInfo.InvariantCulture);
        int check = int.Parse(digits.AsSpan(8, 2), CultureInfo.InvariantCulture);
        return 97 - (body % 97) == check ? digits : null;
    }

    /// <summary>Null for a blank value (the field is optional), otherwise the number as <c>0123.456.749</c>.</summary>
    public static string? NormalizeCompanyNumber(string? input, string code)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return null;
        }

        string digits = TryDigits(input) ?? throw Invalid(code);
        return $"{digits[..4]}.{digits[4..7]}.{digits[7..]}";
    }

    /// <summary>Null for a blank value (VAT is optional), otherwise <c>BE0123456749</c>.</summary>
    public static string? NormalizeVat(string? input, string code)
    {
        if (string.IsNullOrWhiteSpace(input))
        {
            return null;
        }

        return "BE" + (TryDigits(input) ?? throw Invalid(code));
    }

    private static ValidationException Invalid(string code)
        => new("That is not a valid Belgian enterprise number.") { Code = code };
}
