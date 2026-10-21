using System.Globalization;

namespace OpenRestoApi.Core.Application.Site;

/// <summary>
/// The two languages a public site is written in, and which one a visitor gets: the explicit
/// <c>?lang=</c> switch first, then the browser's <c>Accept-Language</c>, then French.
/// </summary>
/// <seealso>SiteLanguageTests.Negotiate_LetsTheExplicitSwitchWin</seealso>
/// <seealso>SiteLanguageTests.Negotiate_IgnoresAnUnsupportedSwitch_AndFallsThroughToTheHeader</seealso>
/// <seealso>SiteLanguageTests.Negotiate_ReadsTheHeaderByQualityThenByOrder</seealso>
/// <seealso>SiteLanguageTests.Negotiate_FallsBackToFrenchForAnythingElse</seealso>
public static class SiteLanguage
{
    public const string French = "fr";
    public const string Dutch = "nl";

    /// <summary>The language of a site nobody asked otherwise of.</summary>
    public const string Default = French;

    public const string QueryKey = "lang";

    private const int MaxHeaderLength = 512;
    private const int MaxHeaderEntries = 16;

    /// <summary>True only for exactly <c>fr</c> or <c>nl</c>: the one test a value from the address bar passes before it is echoed anywhere.</summary>
    public static bool IsSupported(string? language) => language is French or Dutch;

    public static string Negotiate(string? queryLanguage, string? acceptLanguage)
        => IsSupported(queryLanguage) ? queryLanguage! : FromAcceptLanguage(acceptLanguage) ?? Default;

    /// <summary>The supported language the browser ranks highest, or null when it names none; the earlier entry wins a tie.</summary>
    public static string? FromAcceptLanguage(string? header)
    {
        if (string.IsNullOrWhiteSpace(header) || header.Length > MaxHeaderLength)
        {
            return null;
        }

        string? best = null;
        double bestQuality = 0;
        foreach (string entry in header.Split(',', MaxHeaderEntries, StringSplitOptions.TrimEntries))
        {
            string[] parts = entry.Split(';', StringSplitOptions.TrimEntries);
            string? language = PrimaryLanguage(parts[0]);
            if (language is null || !TryReadQuality(parts, out double quality) || quality <= bestQuality)
            {
                continue;
            }

            best = language;
            bestQuality = quality;
        }
        return best;
    }

    /// <summary>
    /// <paramref name="path"/> with <c>lang=</c> added to its query, ahead of any fragment. Only a
    /// supported language is ever written; anything else leaves the path as it was.
    /// </summary>
    /// <seealso>SiteLanguageTests.WithLanguage_AddsTheLanguageBeforeAFragment</seealso>
    /// <seealso>SiteLanguageTests.WithLanguage_LeavesThePathAloneForAnUnsupportedValue</seealso>
    public static string WithLanguage(string path, string? language)
    {
        if (!IsSupported(language))
        {
            return path;
        }

        int fragment = path.IndexOf('#', StringComparison.Ordinal);
        string head = fragment < 0 ? path : path[..fragment];
        string tail = fragment < 0 ? string.Empty : path[fragment..];
        return $"{head}{(head.Contains('?', StringComparison.Ordinal) ? '&' : '?')}{QueryKey}={language}{tail}";
    }

    private static string? PrimaryLanguage(string tag)
    {
        string primary = tag.Split('-', 2)[0];
        return primary.Equals(French, StringComparison.OrdinalIgnoreCase) ? French
            : primary.Equals(Dutch, StringComparison.OrdinalIgnoreCase) ? Dutch
            : null;
    }

    /// <summary>No <c>q</c> is 1; a malformed or out-of-range one makes the whole entry unusable rather than guessed at.</summary>
    private static bool TryReadQuality(string[] parts, out double quality)
    {
        quality = 1;
        foreach (string parameter in parts.Skip(1))
        {
            if (!parameter.StartsWith("q=", StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            return double.TryParse(parameter[2..], NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out quality)
                && quality is >= 0 and <= 1;
        }
        return true;
    }
}
