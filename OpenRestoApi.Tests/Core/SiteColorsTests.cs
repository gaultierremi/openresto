using OpenRestoApi.Core.Application.Site;
using static OpenRestoApi.Core.Application.Site.SiteColors;

namespace OpenRestoApi.Tests.Core;

public class SiteColorsTests
{
    /// <summary>Brand colours picked for a button, not for text: pale, saturated, mid-grey and dark ones.</summary>
    public static IEnumerable<object[]> BrandColors() =>
        new[]
        {
            "#0a7ea4", "#ffffff", "#000000", "#ffe14d", "#f5f5dc", "#808080", "#767676", "#777777", "#ff0000",
            "#00ff00", "#0000ff", "#1b1b3a", "#e8d5b7", "#c0392b", "#27ae60", "#8e44ad", "#fffacd", "#003366",
        }.Select(c => new object[] { c });

    [Fact]
    public void Contrast_OfBlackOnWhite_IsTheMaximum()
        => Assert.Equal(21.0, Contrast(Black, White), 5);

    [Fact]
    public void Contrast_OfAColourWithItself_IsOne()
        => Assert.Equal(1.0, Contrast(new Rgb(120, 40, 200), new Rgb(120, 40, 200)), 5);

    [Fact]
    public void Contrast_IsSymmetric()
    {
        var a = new Rgb(10, 126, 164);
        var b = new Rgb(250, 245, 236);

        Assert.Equal(Contrast(a, b), Contrast(b, a), 10);
    }

    [Theory]
    [InlineData("#0a7ea4", 10, 126, 164)]
    [InlineData("#FFFFFF", 255, 255, 255)]
    [InlineData("#00000080", 0, 0, 0)]
    public void TryParse_ReadsSixAndEightDigitColours(string hex, int r, int g, int b)
    {
        Assert.True(TryParse(hex, out Rgb color));
        Assert.Equal(new Rgb(r, g, b), color);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("0a7ea4")]
    [InlineData("#abc")]
    [InlineData("#gggggg")]
    [InlineData("#0a7ea4zz")]
    [InlineData("#0a7ea45")]
    [InlineData("red")]
    [InlineData("#0a7ea4; background:url(x)")]
    public void TryParse_RefusesAnythingElse(string? hex)
        => Assert.False(TryParse(hex, out _));

    [Fact]
    public void Hex_WritesLowerCaseSixDigits()
        => Assert.Equal("#0a7ea4", new Rgb(10, 126, 164).Hex);

    [Fact]
    public void Mix_ReturnsEachEndAtZeroAndOne()
    {
        var a = new Rgb(10, 20, 30);
        var b = new Rgb(200, 100, 50);

        Assert.Equal(a, Mix(a, b, 0));
        Assert.Equal(b, Mix(a, b, 1));
    }

    [Theory]
    [MemberData(nameof(BrandColors))]
    public void Readable_MeetsTheContrastFloor_ForAnyBrandColourOnEveryBackground(string hex)
    {
        TryParse(hex, out Rgb brand);
        foreach (string bg in new[] { "#faf5ec", "#12100e", "#ffffff", "#e6f2f6", "#808080", "#767676" })
        {
            TryParse(bg, out Rgb background);

            Assert.True(
                Contrast(Readable(brand, background), background) >= MinimumContrast,
                $"{hex} on {bg} came out at {Contrast(Readable(brand, background), background):F2}");
        }
    }

    [Fact]
    public void Readable_LeavesAColourThatAlreadyReadsUntouched()
    {
        var dark = new Rgb(20, 40, 80);

        Assert.Equal(dark, Readable(dark, White));
    }

    [Fact]
    public void Readable_KeepsTheHue_WhenItOnlyHasToDarken()
    {
        TryParse("#ffe14d", out Rgb yellow);

        Rgb fixedUp = Readable(yellow, White);

        Assert.True(fixedUp.R >= fixedUp.B && fixedUp.G >= fixedUp.B, "still a yellow, not a grey");
    }

    [Theory]
    [MemberData(nameof(BrandColors))]
    public void OnColor_PicksTheTextColourThatContrastsMost(string hex)
    {
        TryParse(hex, out Rgb fill);

        Rgb text = OnColor(fill);

        Assert.True(Contrast(text, fill) >= MinimumContrast, $"{hex}: {Contrast(text, fill):F2}");
        Assert.True(Contrast(text, fill) >= Math.Min(Contrast(Black, fill), Contrast(White, fill)));
    }
}
