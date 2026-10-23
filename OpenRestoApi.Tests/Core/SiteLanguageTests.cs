using OpenRestoApi.Core.Application.Site;

namespace OpenRestoApi.Tests.Core;

public class SiteLanguageTests
{
    [Theory]
    [InlineData("fr", null, "fr")]
    [InlineData("nl", null, "nl")]
    [InlineData("en", "nl", "en")]
    [InlineData("nl", "fr-BE,fr;q=0.9", "nl")]
    [InlineData("fr", "nl-BE,nl;q=0.9", "fr")]
    public void Negotiate_LetsTheExplicitSwitchWin(string query, string? header, string expected)
        => Assert.Equal(expected, SiteLanguage.Negotiate(query, header));

    [Theory]
    [InlineData("de", "nl-BE,nl;q=0.9,fr;q=0.8", "nl")]
    [InlineData("de", "en-US", "en")]
    [InlineData("", "nl", "nl")]
    [InlineData("  ", "nl", "nl")]
    [InlineData("NL", "nl", "nl")]
    [InlineData("NL", null, "fr")]
    [InlineData("nl ", null, "fr")]
    [InlineData("nl,fr", null, "fr")]
    [InlineData("https://evil.example", "nl", "nl")]
    [InlineData(null, null, "fr")]
    public void Negotiate_IgnoresAnUnsupportedSwitch_AndFallsThroughToTheHeader(string? query, string? header, string expected)
        => Assert.Equal(expected, SiteLanguage.Negotiate(query, header));

    [Theory]
    [InlineData("nl-BE,nl;q=0.9,fr;q=0.8", "nl")]
    [InlineData("fr-BE,fr;q=0.9,nl;q=0.8", "fr")]
    [InlineData("fr;q=0.5,nl;q=0.9", "nl")]
    [InlineData("nl;q=0.4,fr;q=0.5", "fr")]
    [InlineData("nl,fr", "nl")]
    [InlineData("fr,nl", "fr")]
    [InlineData("fr;q=0.8,nl;q=0.8", "fr")]
    [InlineData("en-US,en;q=0.9,nl;q=0.5", "en")]
    [InlineData("NL-be", "nl")]
    [InlineData("  nl  ;  q=0.7 ", "nl")]
    [InlineData("fr;q=0,nl;q=0.1", "nl")]
    public void Negotiate_ReadsTheHeaderByQualityThenByOrder(string header, string expected)
        => Assert.Equal(expected, SiteLanguage.Negotiate(null, header));

    [Theory]
    [InlineData("de")]
    [InlineData("*")]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(",,,")]
    [InlineData(";;;q=,,")]
    [InlineData("nl;q=abc")]
    [InlineData("nl;q=2")]
    [InlineData("nl;q=-1")]
    [InlineData("fr;q=0")]
    [InlineData("nlx")]
    [InlineData("f")]
    public void Negotiate_FallsBackToFrenchForAnythingElse(string header)
        => Assert.Equal("fr", SiteLanguage.Negotiate(null, header));

    [Fact]
    public void Negotiate_IgnoresAMalformedEntry_ButStillReadsTheOthers()
        => Assert.Equal("nl", SiteLanguage.Negotiate(null, "fr;q=abc,nl;q=0.1"));

    [Fact]
    public void Negotiate_ReadsAHeaderOfTheLimitAndIgnoresOneBeyondIt()
    {
        string padding = string.Concat(Enumerable.Repeat("en,", 300));
        string atTheLimit = "nl," + padding[..509];

        Assert.Equal(512, atTheLimit.Length);
        Assert.Equal("nl", SiteLanguage.Negotiate(null, atTheLimit));
        Assert.Equal("fr", SiteLanguage.Negotiate(null, atTheLimit + "x"));
    }

    [Fact]
    public void Negotiate_ReadsOnlyTheFirstEntriesOfALongList()
    {
        string manyEntries = string.Join(',', Enumerable.Repeat("de", 16)) + ",nl";

        Assert.Equal("fr", SiteLanguage.Negotiate(null, manyEntries));
        Assert.Equal("nl", SiteLanguage.Negotiate(null, string.Join(',', Enumerable.Repeat("de", 15)) + ",nl"));
    }

    [Theory]
    [InlineData("fr", true)]
    [InlineData("nl", true)]
    [InlineData("FR", false)]
    [InlineData("en", true)]
    [InlineData("nl ", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    public void IsSupported_AcceptsExactlyFrNlAndEn(string? language, bool expected)
        => Assert.Equal(expected, SiteLanguage.IsSupported(language));

    [Theory]
    [InlineData("/locations/3", "nl", "/locations/3?lang=nl")]
    [InlineData("/locations/3", "fr", "/locations/3?lang=fr")]
    [InlineData("/r/brasserie#contact", "nl", "/r/brasserie?lang=nl#contact")]
    [InlineData("/locations/3?x=1", "nl", "/locations/3?x=1&lang=nl")]
    [InlineData("/locations/3?x=1#top", "fr", "/locations/3?x=1&lang=fr#top")]
    public void WithLanguage_AddsTheLanguageBeforeAFragment(string path, string language, string expected)
        => Assert.Equal(expected, SiteLanguage.WithLanguage(path, language));

    [Theory]
    [InlineData("https://evil.example")]
    [InlineData("//evil.example")]
    [InlineData("nl&x=1")]
    [InlineData("NL")]
    [InlineData("de")]
    [InlineData("")]
    [InlineData(null)]
    public void WithLanguage_LeavesThePathAloneForAnUnsupportedValue(string? language)
        => Assert.Equal("/locations/3", SiteLanguage.WithLanguage("/locations/3", language));
}
