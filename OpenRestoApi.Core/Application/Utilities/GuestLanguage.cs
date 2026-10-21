namespace OpenRestoApi.Core.Application.Utilities;

/// <summary>
/// Which language a booking email is written in. Only French, Dutch and English have email copy;
/// any other supported locale is written in English, as every locale was before copy existed.
/// </summary>
/// <seealso>GuestLanguageTests.ForEmail_KeepsALocaleThatHasCopy</seealso>
/// <seealso>GuestLanguageTests.ForEmail_WritesEnglishForALocaleWithoutCopy</seealso>
/// <seealso>GuestLanguageTests.ForEmail_UsesTheInstanceDefaultWhenTheBookingHasNone</seealso>
public static class GuestLanguage
{
    public const string English = "en";
    public const string French = "fr";
    public const string Dutch = "nl";

    public static string ForEmail(string? bookingLocale, string? instanceDefault)
    {
        string? chosen = SupportedLocales.IsSupported(bookingLocale) ? bookingLocale : instanceDefault;
        string normalised = SupportedLocales.IsSupported(chosen) ? chosen!.Trim().ToLowerInvariant() : English;
        return normalised is French or Dutch ? normalised : English;
    }

    public static string Normalise(string? language) =>
        string.Equals(language, French, StringComparison.OrdinalIgnoreCase) ? French
        : string.Equals(language, Dutch, StringComparison.OrdinalIgnoreCase) ? Dutch
        : English;
}
