using OpenRestoApi.Core.Application.Site;
using OpenRestoApi.Core.Domain;
using static OpenRestoApi.Core.Application.Site.SiteColors;

namespace OpenRestoApi.Tests.Core;

public class SiteThemesTests
{
    public static IEnumerable<object[]> EveryThemeAndBrandColour() =>
        from theme in Enum.GetValues<SiteTheme>()
        from color in SiteColorsTests.BrandColors().Select(c => (string)c[0])
        select new object[] { theme, color };

    [Theory]
    [MemberData(nameof(EveryThemeAndBrandColour))]
    public void Palette_EveryTextPairMeetsTheContrastFloor_ForEveryThemeAndBrandColour(SiteTheme theme, string brand)
    {
        SiteThemes.Palette p = SiteThemes.PaletteFor(theme, brand);

        (string Name, Rgb Foreground, Rgb Background)[] pairs =
        [
            ("text/background", p.Text, p.Background),
            ("text/surface", p.Text, p.Surface),
            ("muted/background", p.Muted, p.Background),
            ("muted/surface", p.Muted, p.Surface),
            ("accent/background", p.Accent, p.Background),
            ("accent/surface", p.Accent, p.Surface),
            ("on-button/button", p.OnButton, p.Button),
        ];

        foreach ((string name, Rgb fg, Rgb bg) in pairs)
        {
            Assert.True(Contrast(fg, bg) >= MinimumContrast, $"{theme} {brand} {name}: {Contrast(fg, bg):F2}");
        }
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("blue")]
    [InlineData("#12345")]
    public void Palette_FallsBackToTheDefaultBrandColour_WhenTheOneGivenIsNotAColour(string? brand)
        => Assert.Equal(
            SiteThemes.PaletteFor(SiteTheme.Brasserie, SitePageModel.DefaultPrimaryColor),
            SiteThemes.PaletteFor(SiteTheme.Brasserie, brand));

    [Fact]
    public void TheThreeThemesLookDifferent()
    {
        string a = SiteThemes.Css(SiteTheme.Brasserie, "#0a7ea4");
        string b = SiteThemes.Css(SiteTheme.Gastronomique, "#0a7ea4");
        string c = SiteThemes.Css(SiteTheme.Cafe, "#0a7ea4");

        Assert.Equal(3, new[] { a, b, c }.Distinct().Count());
    }

    [Fact]
    public void Gastronomique_IsADarkTheme_AndTheOthersAreLight()
    {
        Assert.True(Luminance(SiteThemes.PaletteFor(SiteTheme.Gastronomique, "#0a7ea4").Background) < 0.05);
        Assert.True(Luminance(SiteThemes.PaletteFor(SiteTheme.Brasserie, "#0a7ea4").Background) > 0.8);
        Assert.True(Luminance(SiteThemes.PaletteFor(SiteTheme.Cafe, "#0a7ea4").Background) > 0.8);
    }

    [Fact]
    public void Css_NamesThePaletteAsVariables_AndNeverFetchesAnything()
    {
        string css = SiteThemes.Css(SiteTheme.Cafe, "#c0392b");

        Assert.Contains("--button:#c0392b", css, StringComparison.Ordinal);
        Assert.DoesNotContain("url(", css, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("@import", css, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("@font-face", css, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Css_IsIdenticalForTheSameInputs_SoItsHashIsStable()
        => Assert.Equal(SiteThemes.Css(SiteTheme.Brasserie, "#0a7ea4"), SiteThemes.Css(SiteTheme.Brasserie, "#0a7ea4"));

    [Fact]
    public void Css_NeverCarriesTextTheBrandSuppliedBeyondAColour()
    {
        string css = SiteThemes.Css(SiteTheme.Brasserie, "#0a7ea4;}</style><script>alert(1)</script>");

        Assert.DoesNotContain("<script", css, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("</style", css, StringComparison.OrdinalIgnoreCase);
    }
}
