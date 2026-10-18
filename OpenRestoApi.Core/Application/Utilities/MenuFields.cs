using System.Globalization;
using System.Text.RegularExpressions;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Utilities;

/// <summary>
/// Field caps for menus, categories and items, and the wire names of their enums. The API speaks
/// enum names (<c>"SoldOut"</c>, <c>["Gluten","Milk"]</c>) rather than the stored integers, so a
/// client never has to know the bit layout of <see cref="Allergens"/>.
/// </summary>
public static partial class MenuFields
{
    public const int MaxNameLength = 80;
    public const int MaxDescriptionLength = 500;
    public const int CurrencyLength = 3;
    public const int MaxAvailabilityLength = 16;

    /// <summary>One million in major units: far above any dish, low enough to catch a typo'd extra zero run.</summary>
    public const long MaxPriceMinor = 100_000_000;

    [GeneratedRegex("^[A-Z]{3}$")]
    private static partial Regex CurrencyPattern();

    /// <summary>The ISO 4217 shape only: three upper-case letters, not membership of the code list.</summary>
    /// <seealso>MenuFieldsTests.IsValidCurrency_AcceptsThreeUpperCaseLetters</seealso>
    /// <seealso>MenuFieldsTests.IsValidCurrency_RejectsAnythingElse</seealso>
    public static bool IsValidCurrency(string value) => CurrencyPattern().IsMatch(value);

    public static string ToName(MenuItemAvailability value) => value.ToString();

    public static bool TryParseAvailability(string? name, out MenuItemAvailability value)
        => TryParseName(name, out value);

    public static List<string> ToNames<TFlags>(TFlags value) where TFlags : struct, Enum
        => Enum.GetValues<TFlags>()
            .Where(flag => Bits(flag) != 0 && value.HasFlag(flag))
            .Select(flag => flag.ToString())
            .ToList();

    /// <summary>
    /// Folds a list of single flag names into one value. Duplicates are harmless; an unknown name,
    /// a numeric string or the <c>None</c> member fails the whole list.
    /// </summary>
    /// <seealso>MenuFieldsTests.TryParseFlags_FoldsKnownNames</seealso>
    /// <seealso>MenuFieldsTests.TryParseFlags_RejectsUnknownOrNumericNames</seealso>
    public static bool TryParseFlags<TFlags>(IEnumerable<string>? names, out TFlags value) where TFlags : struct, Enum
    {
        int bits = 0;
        foreach (string name in names ?? [])
        {
            if (!TryParseName(name, out TFlags flag) || Bits(flag) == 0)
            {
                value = default;
                return false;
            }
            bits |= Bits(flag);
        }
        value = (TFlags)Enum.ToObject(typeof(TFlags), bits);
        return true;
    }

    private static int Bits<TEnum>(TEnum value) where TEnum : struct, Enum
        => Convert.ToInt32(value, CultureInfo.InvariantCulture);

    private static bool TryParseName<TEnum>(string? name, out TEnum value) where TEnum : struct, Enum
    {
        foreach (TEnum candidate in Enum.GetValues<TEnum>())
        {
            if (string.Equals(candidate.ToString(), name, StringComparison.Ordinal))
            {
                value = candidate;
                return true;
            }
        }
        value = default;
        return false;
    }
}
