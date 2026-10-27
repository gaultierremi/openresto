using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Application.Utilities;

namespace OpenRestoApi.Tests.Utilities;

public class MenuImportTests
{
    [Theory]
    [InlineData("fr", "Soupe", "8,50 €")]
    [InlineData("nl", "Soep", "8,50")]
    [InlineData("en", "Soup", "8.50 EUR")]
    public void ProposesDishesWithExactCentsAndSourceLanguage_WithoutInventingDeclarations(string language, string name, string price)
    {
        var result = MenuImport.Propose($"Entrées:\r\n{name} {price}\nPlats:\nStoemp 18\nEau", language);
        Assert.Equal(2, result.Categories.Count);
        var dish = Assert.Single(result.Categories[0].Items);
        Assert.Equal(name, dish.Name);
        Assert.Equal(850, dish.PriceMinor);
        Assert.Equal(language, dish.PrimaryLanguage);
        Assert.Empty(dish.Allergens!);
        Assert.Empty(dish.DietaryTags!);
        Assert.Null(dish.Translations);
        Assert.Equal(1800, result.Categories[1].Items[0].PriceMinor);
        Assert.Null(result.Categories[1].Items[1].PriceMinor);
    }

    [Theory]
    [InlineData("", "fr")]
    [InlineData("Plats:", "fr")]
    [InlineData("Soupe -8.50", "fr")]
    [InlineData("Soupe 8.50", "de")]
    [InlineData("Soupe\0 8.50", "fr")]
    public void RefusesInvalidSource(string text, string language)
        => Assert.Throws<ValidationException>(() => MenuImport.Propose(text, language));

    [Fact]
    public void EnforcesDishAndTextLimits()
    {
        Assert.Equal(80, MenuImport.Propose(string.Join('\n', Enumerable.Repeat("Soupe 8", 80)), "fr").Categories.Single().Items.Count);
        Assert.Throws<ValidationException>(() => MenuImport.Propose(string.Join('\n', Enumerable.Repeat("Soupe 8", 81)), "fr"));
        Assert.Throws<ValidationException>(() => MenuImport.Propose(new string('a', 20001), "fr"));
    }
}
