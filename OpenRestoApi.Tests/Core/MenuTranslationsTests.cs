using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Site;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Core;

public class MenuTranslationsTests
{
    [Theory]
    [InlineData("fr", "Soupe", "Légumes")]
    [InlineData("nl", "Soep", "Légumes")]
    [InlineData("en", "Soupe", "Vegetables")]
    [InlineData("de", "Soupe", "Légumes")]
    public void Resolve_FallsBackPerFieldToTheOriginal(string language, string name, string description)
    {
        Dictionary<string, MenuItemTranslationDto> translations = new()
        {
            ["nl"] = new() { Name = "Soep", Description = " " },
            ["en"] = new() { Name = "", Description = "Vegetables" },
            ["fr"] = new() { Name = "Ignored" },
        };
        var text = MenuTranslations.Resolve("Soupe", "Légumes", "fr", translations, language);
        Assert.Equal(name, text.Name);
        Assert.Equal(description, text.Description);
    }

    [Theory]
    [InlineData("fr", "Soupe")]
    [InlineData("nl", "Soep")]
    [InlineData("en", "Soup")]
    public void Site_UsesTheSameTranslatedDishInHtmlAndStructuredData(string language, string name)
    {
        var item = new PublicMenuItemView("Soupe", "Légumes", 1250, null, false, Allergens.Milk, DietaryTags.Vegetarian,
            "fr", new() { ["nl"] = new() { Name = "Soep" }, ["en"] = new() { Name = "Soup" } });
        var model = new SitePageModel
        {
            Name = "Example",
            Slug = "example",
            BaseUrl = "https://restaurant.example",
            Language = language,
            Menus = [new("Menu", null, "EUR", [new("Plats", null, [item])])],
        };
        string html = SitePageRenderer.Render(model).Html;
        Assert.Contains($"<span class=\"nm\">{name}</span>", html, StringComparison.Ordinal);
        Assert.Contains($"\"name\":\"{name}\"", html, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("fr")]
    [InlineData("nl")]
    [InlineData("en")]
    public void ConfirmationLink_PreservesTheBookingsLanguage(string language)
    {
        var booking = new Booking { BookingRef = "EXAMPLE", CustomerEmail = "guest@example.com", Locale = language };
        Assert.EndsWith($"&lang={language}", BookingLinks.Confirmation("https://restaurant.example", booking), StringComparison.Ordinal);
    }
}
