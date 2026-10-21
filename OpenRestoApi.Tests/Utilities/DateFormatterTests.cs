using OpenRestoApi.Core.Application.Utilities;

namespace OpenRestoApi.Tests.Utilities;

public class DateFormatterTests
{
    // Invariant culture forces English month/weekday names and "AM/PM" regardless of server
    // locale — these snapshots document that contract.

    [Fact]
    public void FormatLongDate_ProducesInvariantLongForm()
    {
        DateTime d = new DateTime(2026, 4, 18, 0, 0, 0, DateTimeKind.Unspecified);

        Assert.Equal("Saturday, 18 April 2026", DateFormatter.FormatLongDate(d));
    }

    [Fact]
    public void FormatTime_ProducesTwelveHourForm()
    {
        DateTime morning = new DateTime(2026, 4, 18, 9, 5, 0, DateTimeKind.Unspecified);
        DateTime afternoon = new DateTime(2026, 4, 18, 15, 45, 0, DateTimeKind.Unspecified);

        Assert.Equal("9:05 AM", DateFormatter.FormatTime(morning));
        Assert.Equal("3:45 PM", DateFormatter.FormatTime(afternoon));
    }

    [Fact]
    public void FormatTimeRange_JoinsStartAndEndWithEnDash()
    {
        DateTime start = new DateTime(2026, 4, 18, 15, 45, 0, DateTimeKind.Unspecified);
        DateTime end = new DateTime(2026, 4, 18, 17, 45, 0, DateTimeKind.Unspecified);

        Assert.Equal("3:45 PM – 5:45 PM", DateFormatter.FormatTimeRange(start, end));
    }

    [Theory]
    [InlineData("fr", "samedi 18 avril 2026")]
    [InlineData("nl", "zaterdag 18 april 2026")]
    [InlineData("en", "Saturday, 18 April 2026")]
    [InlineData("es", "Saturday, 18 April 2026")]
    [InlineData(null, "Saturday, 18 April 2026")]
    public void FormatLongDate_WritesTheLanguagesOwnNames(string? language, string expected)
    {
        Assert.Equal(expected, DateFormatter.FormatLongDate(new DateTime(2026, 4, 18), language));
    }

    [Theory]
    [InlineData("fr", "dimanche 1 février 2026")]
    [InlineData("nl", "zondag 1 februari 2026")]
    public void FormatLongDate_ReadsEveryNameFromTheDate(string language, string expected)
    {
        Assert.Equal(expected, DateFormatter.FormatLongDate(new DateTime(2026, 2, 1), language));
    }

    [Theory]
    [InlineData("fr", "15:45 – 17:05")]
    [InlineData("nl", "15:45 – 17:05")]
    [InlineData("en", "3:45 PM – 5:05 PM")]
    [InlineData(null, "3:45 PM – 5:05 PM")]
    public void FormatTime_UsesTwentyFourHoursOutsideEnglish(string? language, string expected)
    {
        var start = new DateTime(2026, 4, 18, 15, 45, 0);
        var end = new DateTime(2026, 4, 18, 17, 5, 0);

        Assert.Equal(expected, DateFormatter.FormatTimeRange(start, end, language));
    }
}
