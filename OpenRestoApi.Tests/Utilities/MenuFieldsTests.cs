using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Utilities;

public class MenuFieldsTests
{
    [Theory]
    [InlineData("EUR")]
    [InlineData("JPY")]
    public void IsValidCurrency_AcceptsThreeUpperCaseLetters(string code)
        => Assert.True(MenuFields.IsValidCurrency(code));

    [Theory]
    [InlineData("eur")]
    [InlineData("EU")]
    [InlineData("EURO")]
    [InlineData("E1R")]
    [InlineData("")]
    public void IsValidCurrency_RejectsAnythingElse(string code)
        => Assert.False(MenuFields.IsValidCurrency(code));

    [Fact]
    public void TryParseFlags_FoldsKnownNames()
    {
        Assert.True(MenuFields.TryParseFlags(["Sesame", "Lupin", "Sesame"], out Allergens allergens));
        Assert.Equal(Allergens.Sesame | Allergens.Lupin, allergens);
        Assert.True(MenuFields.TryParseFlags<DietaryTags>(null, out DietaryTags none));
        Assert.Equal(DietaryTags.None, none);
    }

    [Theory]
    [InlineData("Sesam")]
    [InlineData("sesame")]
    [InlineData("1024")]
    [InlineData("None")]
    public void TryParseFlags_RejectsUnknownOrNumericNames(string name)
        => Assert.False(MenuFields.TryParseFlags<Allergens>(["Milk", name], out _));

    [Fact]
    public void Allergens_CoverTheFourteenEuAllergens_AndRoundTripByName()
    {
        Allergens all = Enum.GetValues<Allergens>().Aggregate(Allergens.None, (acc, a) => acc | a);
        List<string> names = MenuFields.ToNames(all);

        Assert.Equal(14, names.Count);
        Assert.True(MenuFields.TryParseFlags(names, out Allergens parsed));
        Assert.Equal(all, parsed);
    }

    [Fact]
    public void TryParseAvailability_AcceptsOnlyTheThreeNames()
    {
        Assert.True(MenuFields.TryParseAvailability("Hidden", out MenuItemAvailability hidden));
        Assert.Equal(MenuItemAvailability.Hidden, hidden);
        Assert.False(MenuFields.TryParseAvailability("2", out _));
        Assert.False(MenuFields.TryParseAvailability("soldout", out _));
    }
}
