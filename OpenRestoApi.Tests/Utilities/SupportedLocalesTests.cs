using OpenRestoApi.Core.Application.Utilities;

namespace OpenRestoApi.Tests.Utilities;

public class SupportedLocalesTests
{
    [Theory]
    [InlineData("en")]
    [InlineData("fr")]
    [InlineData("es")]
    [InlineData("de")]
    [InlineData("nl")]
    [InlineData(" NL ")]
    public void IsSupported_AcceptsEveryUiLocale(string locale)
    {
        Assert.True(SupportedLocales.IsSupported(locale));
    }

    [Theory]
    [InlineData("pt")]
    [InlineData("nl-BE")]
    [InlineData("")]
    [InlineData(null)]
    public void IsSupported_RefusesAnythingElse(string? locale)
    {
        Assert.False(SupportedLocales.IsSupported(locale));
    }

    [Theory]
    [InlineData("nl", "nl")]
    [InlineData(" NL ", "nl")]
    [InlineData("Fr", "fr")]
    [InlineData("es", "es")]
    public void Normalise_KeepsASupportedLocaleTrimmedAndLowerCase(string locale, string expected)
    {
        Assert.Equal(expected, SupportedLocales.Normalise(locale));
    }

    [Theory]
    [InlineData("nl-BE")]
    [InlineData("pt")]
    [InlineData("nlnlnlnlnl")]
    [InlineData("<script>")]
    [InlineData("  ")]
    [InlineData("")]
    [InlineData(null)]
    public void Normalise_DropsAnythingElse(string? locale)
    {
        Assert.Null(SupportedLocales.Normalise(locale));
    }
}
