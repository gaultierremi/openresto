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
}
