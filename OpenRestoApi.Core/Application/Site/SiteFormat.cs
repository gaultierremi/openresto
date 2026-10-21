using System.Globalization;
using System.Text;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Site;

/// <summary>
/// The French wording and number formats of a site. Fixed rather than looked up in culture data:
/// the slim images this ships in carry no ICU, so <c>fr-BE</c> would quietly format like the
/// invariant culture there.
/// </summary>
public static class SiteFormat
{
    private const string NoBreakSpace = " ";
    private const string NarrowNoBreakSpace = " ";

    private static readonly string[] _days =
        ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

    private static readonly string[] _schemaDays =
        ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

    /// <summary>Currencies whose minor unit is the major one (JPY) or a thousandth (KWD); everything else has cents.</summary>
    private static readonly HashSet<string> _noMinorUnit = new(StringComparer.Ordinal)
    {
        "BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
    };

    private static readonly HashSet<string> _thousandths = new(StringComparer.Ordinal)
    {
        "BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND",
    };

    private static readonly (Allergens Flag, string Label)[] _allergens =
    [
        (Allergens.Gluten, "gluten"), (Allergens.Crustaceans, "crustacés"), (Allergens.Eggs, "œufs"),
        (Allergens.Fish, "poisson"), (Allergens.Peanuts, "arachides"), (Allergens.Soybeans, "soja"),
        (Allergens.Milk, "lait"), (Allergens.Nuts, "fruits à coque"), (Allergens.Celery, "céleri"),
        (Allergens.Mustard, "moutarde"), (Allergens.Sesame, "sésame"), (Allergens.Sulphites, "sulfites"),
        (Allergens.Lupin, "lupin"), (Allergens.Molluscs, "mollusques"),
    ];

    private static readonly (DietaryTags Flag, string Label)[] _diets =
    [
        (DietaryTags.Vegetarian, "Végétarien"), (DietaryTags.Vegan, "Végan"), (DietaryTags.GlutenFree, "Sans gluten"),
    ];

    private static readonly HashSet<string> _httpsOnly = new(StringComparer.OrdinalIgnoreCase) { "https" };

    /// <summary>The one test a link to someone else's site passes before it is written to a page, whether as a link or as structured data.</summary>
    public static bool IsSecureUrl(string? url) => OpenRestoApi.Core.Application.Utilities.UrlValidator.IsValid(url, _httpsOnly);

    public static string DayName(int isoDay) => _days[isoDay - 1];

    /// <summary>The English day name schema.org's <c>dayOfWeek</c> asks for.</summary>
    public static string SchemaDay(int isoDay) => _schemaDays[isoDay - 1];

    public static IReadOnlyList<string> AllergenLabels(Allergens allergens)
        => _allergens.Where(a => allergens.HasFlag(a.Flag)).Select(a => a.Label).ToList();

    public static IReadOnlyList<string> DietLabels(DietaryTags tags)
        => _diets.Where(d => tags.HasFlag(d.Flag)).Select(d => d.Label).ToList();

    /// <summary>
    /// A price the Belgian way: comma decimals, a space before the sign, and a narrow space between
    /// thousands (<c>1 250,00 €</c>). The euro prints as its sign; any other currency as its code,
    /// which is unambiguous where a dollar sign is not.
    /// </summary>
    /// <seealso>SiteFormatTests.Price_PrintsEurosTheBelgianWay</seealso>
    public static string Price(long minor, string currency)
    {
        int digits = Digits(currency);
        decimal divisor = (decimal)Math.Pow(10, digits);
        decimal amount = minor / divisor;

        string text = amount.ToString("N" + digits, CultureInfo.InvariantCulture)
            .Replace(",", NarrowNoBreakSpace, StringComparison.Ordinal)
            .Replace(".", ",", StringComparison.Ordinal);
        return $"{text}{NoBreakSpace}{(currency == "EUR" ? "€" : currency)}";
    }

    /// <summary>The amount for schema.org's <c>price</c>: a plain decimal with a dot, no sign or grouping.</summary>
    public static string SchemaPrice(long minor, string currency)
    {
        int digits = Digits(currency);
        return (minor / (decimal)Math.Pow(10, digits)).ToString("F" + digits, CultureInfo.InvariantCulture);
    }

    /// <summary>The <c>tel:</c> target for a number written any way a person writes one, or null when it holds no digits.</summary>
    /// <seealso>SiteFormatTests.PhoneHref_KeepsTheLeadingPlusAndDropsTheFormatting</seealso>
    public static string? PhoneHref(string? phone)
    {
        if (string.IsNullOrWhiteSpace(phone))
        {
            return null;
        }

        var digits = new StringBuilder();
        foreach (char c in phone.Trim())
        {
            if (char.IsAsciiDigit(c))
            {
                digits.Append(c);
            }
        }

        if (digits.Length == 0)
        {
            return null;
        }

        return phone.TrimStart().StartsWith('+') ? $"tel:+{digits}" : $"tel:{digits}";
    }

    /// <summary>
    /// A search on OpenStreetMap for the address. A plain link: it opens a page the guest asked
    /// for, and loads no script, tile or tracker into this one.
    /// </summary>
    public static string MapUrl(string address)
        => $"https://www.openstreetmap.org/search?query={Uri.EscapeDataString(address)}";

    public static string AbsoluteUrl(string baseUrl, string path)
        => path.StartsWith("http://", StringComparison.Ordinal) || path.StartsWith("https://", StringComparison.Ordinal)
            ? path
            : $"{baseUrl.TrimEnd('/')}/{path.TrimStart('/')}";

    /// <summary>Opening times as a person reads them: <c>11:30 – 22:30</c>.</summary>
    public static string TimeRange(string open, string close) => $"{open}{NoBreakSpace}–{NoBreakSpace}{close}";

    /// <summary>Cuts <paramref name="text"/> to at most <paramref name="max"/> characters at a word boundary, adding an ellipsis.</summary>
    public static string Truncate(string text, int max)
    {
        if (text.Length <= max)
        {
            return text;
        }

        string cut = text[..(max - 1)];
        int space = cut.LastIndexOf(' ');
        return (space > max / 2 ? cut[..space] : cut).TrimEnd(' ', ',', '.', ';', ':') + "…";
    }

    private static int Digits(string currency) => _noMinorUnit.Contains(currency) ? 0 : _thousandths.Contains(currency) ? 3 : 2;
}
