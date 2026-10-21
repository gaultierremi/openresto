using System.Reflection;
using OpenRestoApi.Core.Application.Site;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Core;

public class SiteCopyTests
{
    public static TheoryData<string> Languages => new() { "fr", "nl" };

    [Theory]
    [MemberData(nameof(Languages))]
    public void EveryLanguage_FillsEveryString(string language)
    {
        SiteCopy copy = SiteCopy.For(language);

        foreach (PropertyInfo property in typeof(SiteCopy).GetProperties(BindingFlags.Public | BindingFlags.Instance).Where(p => p.PropertyType == typeof(string)))
        {
            Assert.False(string.IsNullOrEmpty((string?)property.GetValue(copy)), $"{language}: {property.Name}");
            if (property.Name is not (nameof(SiteCopy.GroupSeparator) or nameof(SiteCopy.DecimalSeparator)))
            {
                Assert.False(string.IsNullOrWhiteSpace((string?)property.GetValue(copy)), $"{language}: {property.Name}");
            }
        }

        Assert.Equal(language, copy.Language);
        Assert.Equal(7, copy.Days.Count);
        Assert.All(copy.Days, d => Assert.False(string.IsNullOrWhiteSpace(d)));
        Assert.Equal(Enum.GetValues<Allergens>().Count(a => a != Allergens.None), copy.AllergenTable.Count);
        Assert.Equal(3, copy.DietTable.Count);
        Assert.Equal(copy.AllergenTable.Count, copy.AllergenTable.Select(a => a.Flag).Distinct().Count());
    }

    [Fact]
    public void EveryLanguage_NamesTheSameAllergensAndDiets()
    {
        Assert.Equal(SiteCopy.French.AllergenTable.Select(a => a.Flag), SiteCopy.Dutch.AllergenTable.Select(a => a.Flag));
        Assert.Equal(SiteCopy.French.DietTable.Select(d => d.Flag), SiteCopy.Dutch.DietTable.Select(d => d.Flag));
    }

    [Theory]
    [InlineData("nl", "nl")]
    [InlineData("fr", "fr")]
    [InlineData("NL", "fr")]
    [InlineData("de", "fr")]
    [InlineData("", "fr")]
    [InlineData(null, "fr")]
    public void For_FallsBackToFrench_ForAnythingButNl(string? language, string expected)
        => Assert.Equal(expected, SiteCopy.For(language).Language);

    [Fact]
    public void Dutch_NamesTheDaysAndTheAllergensInDutch()
    {
        Assert.Equal("Maandag", SiteCopy.Dutch.Day(1));
        Assert.Equal("Zondag", SiteCopy.Dutch.Day(7));
        Assert.Equal(["gluten", "melk", "weekdieren"], SiteCopy.Dutch.AllergenLabels(Allergens.Gluten | Allergens.Milk | Allergens.Molluscs));
        Assert.Equal(["Vegetarisch", "Glutenvrij"], SiteCopy.Dutch.DietLabels(DietaryTags.Vegetarian | DietaryTags.GlutenFree));
        Assert.Empty(SiteCopy.Dutch.AllergenLabels(Allergens.None));
    }

    [Fact]
    public void Titles_NameTheBookingOnlyWhereTheSiteTakesBookings()
    {
        Assert.Equal("Chez Nous – Carte, horaires et réservation", SiteCopy.French.TitleFor("Chez Nous", canBook: true));
        Assert.Equal("Chez Nous – Carte, horaires et contact", SiteCopy.French.TitleFor("Chez Nous", canBook: false));
        Assert.Equal("Chez Nous – Menukaart, openingsuren en reservatie", SiteCopy.Dutch.TitleFor("Chez Nous", canBook: true));
        Assert.Equal("Chez Nous – Menukaart, openingsuren en contact", SiteCopy.Dutch.TitleFor("Chez Nous", canBook: false));
    }
}
