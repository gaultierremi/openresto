using System.Globalization;

namespace OpenRestoApi.Core.Application.Utilities;

/// <summary>
/// Date/time formatting for customer-facing surfaces. English uses the invariant culture; French
/// and Dutch read fixed name tables, because the slim images carry no ICU and a culture lookup
/// would quietly answer in English there. The restaurant's timezone, not the server's culture,
/// decides the wall-clock value passed in.
/// </summary>
/// <seealso>DateFormatterTests.FormatLongDate_WritesTheLanguagesOwnNames</seealso>
/// <seealso>DateFormatterTests.FormatTime_UsesTwentyFourHoursOutsideEnglish</seealso>
public static class DateFormatter
{
    // Days are indexed by DayOfWeek (Sunday first), months by month - 1.
    private static readonly Dictionary<string, (string[] Days, string[] Months)> Names = new()
    {
        [GuestLanguage.French] = (
            ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
            ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]),
        [GuestLanguage.Dutch] = (
            ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"],
            ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"]),
    };

    /// <summary>"Saturday, 18 April 2026", "samedi 18 avril 2026", "zaterdag 18 april 2026"</summary>
    public static string FormatLongDate(DateTime date, string? language = null)
    {
        if (!Names.TryGetValue(GuestLanguage.Normalise(language), out var names))
        {
            return date.ToString("dddd, d MMMM yyyy", CultureInfo.InvariantCulture);
        }

        return $"{names.Days[(int)date.DayOfWeek]} {date.Day} {names.Months[date.Month - 1]} {date.Year}";
    }

    /// <summary>"3:45 PM", "15:45"</summary>
    public static string FormatTime(DateTime time, string? language = null)
        => Names.ContainsKey(GuestLanguage.Normalise(language))
            ? time.ToString("HH:mm", CultureInfo.InvariantCulture)
            : time.ToString("h:mm tt", CultureInfo.InvariantCulture);

    /// <summary>"3:45 PM – 5:45 PM"</summary>
    public static string FormatTimeRange(DateTime start, DateTime end, string? language = null)
        => $"{FormatTime(start, language)} – {FormatTime(end, language)}";
}
