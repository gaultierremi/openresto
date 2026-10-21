using System.Globalization;
using System.Net;

namespace OpenRestoApi.Core.Application.Services;

/// <summary>
/// The invitation e-mail, in the three languages a Belgian restaurateur may be written to in.
/// The locale is the platform operator's choice at invitation time (the restaurateur has no
/// account yet, so there is no preference to read); anything else reads in French.
/// </summary>
/// <seealso>InvitationMailTests.Build_SpeaksTheRequestedLanguage_AndFallsBackToFrench</seealso>
/// <seealso>InvitationMailTests.Build_EscapesTheRestaurantName</seealso>
public static class InvitationMail
{
    public const string FallbackLocale = "fr";

    private sealed record Copy(string Subject, string Greeting, string Body, string Button, string Expiry, string Ignore);

    private static readonly Dictionary<string, Copy> Texts = new(StringComparer.OrdinalIgnoreCase)
    {
        ["fr"] = new(
            "Invitation : créez l’espace de {0}",
            "Bonjour,",
            "Vous êtes invité(e) à ouvrir l’espace de <strong>{0}</strong> sur {1} : un assistant vous guide pour renseigner votre établissement, vos horaires, vos tables et votre carte.",
            "Créer mon espace",
            "Ce lien est valable jusqu’au {0} et ne fonctionne qu’une fois.",
            "Si vous n’attendiez pas ce message, vous pouvez l’ignorer."),
        ["nl"] = new(
            "Uitnodiging: maak de ruimte van {0} aan",
            "Goedendag,",
            "U bent uitgenodigd om de ruimte van <strong>{0}</strong> te openen op {1}: een assistent begeleidt u bij het invullen van uw zaak, openingsuren, tafels en kaart.",
            "Mijn ruimte aanmaken",
            "Deze link is geldig tot {0} en werkt maar één keer.",
            "Hebt u dit bericht niet verwacht, dan kunt u het negeren."),
        ["en"] = new(
            "Invitation: set up the space for {0}",
            "Hello,",
            "You are invited to open the space for <strong>{0}</strong> on {1}: an assistant walks you through your venue, opening hours, tables and menu.",
            "Create my space",
            "This link is valid until {0} and works only once.",
            "If you were not expecting this message, you can ignore it."),
    };

    /// <summary>The language the mail will be written in for <paramref name="locale"/>.</summary>
    public static string Resolve(string? locale)
        => locale is not null && Texts.ContainsKey(locale.Trim()) ? locale.Trim().ToLowerInvariant() : FallbackLocale;

    public static (string Subject, string Html) Build(
        string? locale,
        string restaurantName,
        string appName,
        string primaryColor,
        string websiteUrl,
        string invitationUrl,
        DateTime expiresAt)
    {
        string language = Resolve(locale);
        Copy copy = Texts[language];
        string name = WebUtility.HtmlEncode(restaurantName);
        string app = WebUtility.HtmlEncode(appName);
        string color = ColorOrDefault(primaryColor);
        string expiry = FormatDate(expiresAt, language);
        string url = WebUtility.HtmlEncode(invitationUrl);
        CultureInfo culture = CultureInfo.InvariantCulture;

        string header = $"""
            <tr><td style="padding:40px 40px 8px;text-align:center;background-color:#ffffff;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#111827;">{app}</h1>
            </td></tr>
            """;
        string content = $"""
            <tr><td style="padding:16px 40px 32px;background-color:#ffffff;color:#111827;font-size:15px;line-height:1.6;">
              <p style="margin:0 0 12px;">{copy.Greeting}</p>
              <p style="margin:0 0 24px;">{string.Format(culture, copy.Body, name, app)}</p>
              <p style="margin:0 0 24px;text-align:center;">
                <a href="{url}" style="display:inline-block;background-color:{color};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 28px;border-radius:8px;">{copy.Button}</a>
              </p>
              <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">{string.Format(culture, copy.Expiry, expiry)}</p>
              <p style="margin:0;font-size:13px;color:#6b7280;">{copy.Ignore}</p>
            </td></tr>
            """;

        return (
            string.Format(culture, copy.Subject, restaurantName),
            EmailTemplateBuilder.Wrap(color, appName, websiteUrl, header, content));
    }

    // Only a #rrggbb is ever written into the style attribute, whatever the brand holds.
    private static string ColorOrDefault(string? color)
        => color is { Length: 7 } && color[0] == '#' && color[1..].All(char.IsAsciiHexDigit) ? color : "#0a7ea4";

    // Fixed tables rather than culture data: the slim images carry no ICU, where a month name
    // would quietly come out in English.
    private static readonly Dictionary<string, string[]> Months = new()
    {
        ["fr"] = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"],
        ["nl"] = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"],
        ["en"] = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    };

    private static string FormatDate(DateTime date, string language)
        => string.Create(CultureInfo.InvariantCulture, $"{date.Day} {Months[language][date.Month - 1]} {date.Year}");
}
