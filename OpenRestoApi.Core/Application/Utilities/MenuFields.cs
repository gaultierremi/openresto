using System.Collections.Frozen;
using System.Globalization;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Utilities;

/// <summary>
/// Field caps for menus, categories and items, and the wire names of their enums. The API speaks
/// enum names (<c>"SoldOut"</c>, <c>["Gluten","Milk"]</c>) rather than the stored integers, so a
/// client never has to know the bit layout of <see cref="Allergens"/>.
/// </summary>
public static class MenuFields
{
    public const int MaxNameLength = 80;
    public const int MaxDescriptionLength = 500;
    public const int CurrencyLength = 3;
    public const int MaxAvailabilityLength = 16;

    /// <summary>One million in major units: far above any dish, low enough to catch a typo'd extra zero run.</summary>
    public const long MaxPriceMinor = 100_000_000;

    /// <summary>
    /// The active ISO 4217 currency codes (List One), kept in code so validation needs no network
    /// and no culture data, which the invariant-globalization images do not ship. Left out on
    /// purpose: fund and unit-of-account codes (BOV, CHE, CLF, XDR, …), precious metals (XAU, …),
    /// the testing and "no currency" codes (XTS, XXX), and codes withdrawn from circulation (HRK,
    /// BGN, ANG, SLL, ZWL, …).
    /// </summary>
    private static readonly FrozenSet<string> ActiveCurrencies = new[]
    {
        "AED", "AFN", "ALL", "AMD", "AOA", "ARS", "AUD", "AWG", "AZN", "BAM", "BBD", "BDT", "BHD",
        "BIF", "BMD", "BND", "BOB", "BRL", "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", "CDF", "CHF",
        "CLP", "CNY", "COP", "CRC", "CUP", "CVE", "CZK", "DJF", "DKK", "DOP", "DZD", "EGP", "ERN",
        "ETB", "EUR", "FJD", "FKP", "GBP", "GEL", "GHS", "GIP", "GMD", "GNF", "GTQ", "GYD", "HKD",
        "HNL", "HTG", "HUF", "IDR", "ILS", "INR", "IQD", "IRR", "ISK", "JMD", "JOD", "JPY", "KES",
        "KGS", "KHR", "KMF", "KPW", "KRW", "KWD", "KYD", "KZT", "LAK", "LBP", "LKR", "LRD", "LSL",
        "LYD", "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU", "MUR", "MVR", "MWK", "MXN",
        "MYR", "MZN", "NAD", "NGN", "NIO", "NOK", "NPR", "NZD", "OMR", "PAB", "PEN", "PGK", "PHP",
        "PKR", "PLN", "PYG", "QAR", "RON", "RSD", "RUB", "RWF", "SAR", "SBD", "SCR", "SDG", "SEK",
        "SGD", "SHP", "SLE", "SOS", "SRD", "SSP", "STN", "SVC", "SYP", "SZL", "THB", "TJS", "TMT",
        "TND", "TOP", "TRY", "TTD", "TWD", "TZS", "UAH", "UGX", "USD", "UYU", "UZS", "VED", "VES",
        "VND", "VUV", "WST", "XAF", "XCD", "XCG", "XOF", "XPF", "YER", "ZAR", "ZMW", "ZWG",
    }.ToFrozenSet(StringComparer.Ordinal);

    /// <summary>An active ISO 4217 code, upper-case as the standard writes it.</summary>
    /// <seealso>MenuFieldsTests.IsValidCurrency_AcceptsActiveIsoCodes</seealso>
    /// <seealso>MenuFieldsTests.IsValidCurrency_RejectsAnythingElse</seealso>
    public static bool IsValidCurrency(string value) => ActiveCurrencies.Contains(value);

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
