using OpenRestoApi.Core.Application.Utilities;

namespace OpenRestoApi.Tests.Utilities;

public class GuestLanguageTests
{
    [Theory]
    [InlineData("fr", "en", "fr")]
    [InlineData("nl", "fr", "nl")]
    [InlineData("en", "fr", "en")]
    [InlineData("NL", "fr", "nl")]
    public void ForEmail_KeepsALocaleThatHasCopy(string booking, string instanceDefault, string expected)
    {
        Assert.Equal(expected, GuestLanguage.ForEmail(booking, instanceDefault));
    }

    [Theory]
    [InlineData("es", "fr")]
    [InlineData("de", "nl")]
    public void ForEmail_WritesEnglishForALocaleWithoutCopy(string booking, string instanceDefault)
    {
        Assert.Equal("en", GuestLanguage.ForEmail(booking, instanceDefault));
    }

    [Theory]
    [InlineData(null, "fr", "fr")]
    [InlineData("", "nl", "nl")]
    [InlineData("pt", "nl", "nl")]
    [InlineData(null, "es", "en")]
    [InlineData(null, null, "en")]
    [InlineData(null, "klingon", "en")]
    public void ForEmail_UsesTheInstanceDefaultWhenTheBookingHasNone(string? booking, string? instanceDefault, string expected)
    {
        Assert.Equal(expected, GuestLanguage.ForEmail(booking, instanceDefault));
    }
}
