using OpenRestoApi.Core.Application.Site;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Core;

public class SiteFormatTests
{
    private const string Nbsp = " ";
    private const string NarrowNbsp = " ";

    [Theory]
    [InlineData(900L, "EUR", "9,00" + Nbsp + "€")]
    [InlineData(0L, "EUR", "0,00" + Nbsp + "€")]
    [InlineData(5L, "EUR", "0,05" + Nbsp + "€")]
    [InlineData(125000L, "EUR", "1" + NarrowNbsp + "250,00" + Nbsp + "€")]
    [InlineData(500L, "JPY", "500" + Nbsp + "JPY")]
    [InlineData(1234L, "KWD", "1,234" + Nbsp + "KWD")]
    [InlineData(1250L, "USD", "12,50" + Nbsp + "USD")]
    public void Price_PrintsEurosTheBelgianWay(long minor, string currency, string expected)
        => Assert.Equal(expected, SiteFormat.Price(minor, currency));

    [Theory]
    [InlineData(900L, "EUR", "9.00")]
    [InlineData(125000L, "EUR", "1250.00")]
    [InlineData(500L, "JPY", "500")]
    [InlineData(1234L, "KWD", "1.234")]
    public void SchemaPrice_IsAPlainDecimal(long minor, string currency, string expected)
        => Assert.Equal(expected, SiteFormat.SchemaPrice(minor, currency));

    [Theory]
    [InlineData("+32 2 555 01 23", "tel:+3225550123")]
    [InlineData("02/555.01.23", "tel:025550123")]
    [InlineData("  +32 (0)2 555 01 23", "tel:+32025550123")]
    [InlineData("+33-1-23", "tel:+33123")]
    public void PhoneHref_KeepsTheLeadingPlusAndDropsTheFormatting(string phone, string expected)
        => Assert.Equal(expected, SiteFormat.PhoneHref(phone));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  ")]
    [InlineData("n/a")]
    public void PhoneHref_IsNullWhenThereIsNothingToDial(string? phone)
        => Assert.Null(SiteFormat.PhoneHref(phone));

    [Fact]
    public void MapUrl_EncodesTheAddressIntoAPlainOpenStreetMapSearch()
        => Assert.Equal(
            "https://www.openstreetmap.org/search?query=Rue%20des%20Fabriques%2025%2C%201000%20Bruxelles%20%26%20co",
            SiteFormat.MapUrl("Rue des Fabriques 25, 1000 Bruxelles & co"));

    [Theory]
    [InlineData("https://example.be/", "/r/x", "https://example.be/r/x")]
    [InlineData("https://example.be", "r/x", "https://example.be/r/x")]
    [InlineData("https://example.be", "https://cdn.example/a.jpg", "https://cdn.example/a.jpg")]
    public void AbsoluteUrl_JoinsWithoutDoublingTheSlash(string baseUrl, string path, string expected)
        => Assert.Equal(expected, SiteFormat.AbsoluteUrl(baseUrl, path));

    [Fact]
    public void Truncate_LeavesATextAtTheLimitUntouched()
        => Assert.Equal(new string('a', 160), SiteFormat.Truncate(new string('a', 160), 160));

    [Fact]
    public void Truncate_CutsATextOneOverTheLimit_AtAWordBoundary_WithAnEllipsis()
    {
        string text = string.Join(' ', Enumerable.Repeat("mot", 60));

        string cut = SiteFormat.Truncate(text, 160);

        Assert.True(cut.Length <= 160);
        Assert.EndsWith("…", cut, StringComparison.Ordinal);
        Assert.DoesNotContain("mo…", cut, StringComparison.Ordinal);
    }

    [Fact]
    public void Truncate_CutsAnUnbrokenRunWhereverItMust()
        => Assert.Equal(160, SiteFormat.Truncate(new string('a', 400), 160).Length);

    [Theory]
    [InlineData(1, "Lundi", "Monday")]
    [InlineData(7, "Dimanche", "Sunday")]
    public void Days_AreNamedInFrenchAndForSchemaOrg(int day, string french, string schema)
    {
        Assert.Equal(french, SiteFormat.DayName(day));
        Assert.Equal(schema, SiteFormat.SchemaDay(day));
    }

    [Fact]
    public void AllergenLabels_NameEachDeclaredAllergenInFrench()
        => Assert.Equal(["gluten", "lait", "mollusques"], SiteFormat.AllergenLabels(Allergens.Gluten | Allergens.Milk | Allergens.Molluscs));

    [Fact]
    public void AllergenLabels_AreEmptyForNone()
        => Assert.Empty(SiteFormat.AllergenLabels(Allergens.None));

    [Fact]
    public void EveryAllergenHasALabel()
    {
        Allergens all = Enum.GetValues<Allergens>().Aggregate(Allergens.None, (acc, a) => acc | a);

        Assert.Equal(14, SiteFormat.AllergenLabels(all).Count);
    }

    [Fact]
    public void DietLabels_NameEachTagInFrench()
        => Assert.Equal(["Végétarien", "Sans gluten"], SiteFormat.DietLabels(DietaryTags.Vegetarian | DietaryTags.GlutenFree));
}
