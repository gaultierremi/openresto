using System.Text.Json;
using System.Text.RegularExpressions;
using OpenRestoApi.Core.Application.Site;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Core;

public class SiteStructuredDataTests
{
    private const string Canonical = "https://resto.example.be/r/brasserie-de-la-senne-doree";
    private const string BookPath = "/r/brasserie-de-la-senne-doree/reserver";

    private static JsonElement Parse(SitePageModel model)
        => JsonDocument.Parse(SiteStructuredData.Build(model, Canonical, BookPath)).RootElement;

    [Fact]
    public void Build_NamesTheRestaurantItsHoursAndItsPublishedMenuOnly()
    {
        JsonElement ld = Parse(SiteSamples.Full());

        Assert.Equal("https://schema.org", ld.GetProperty("@context").GetString());
        Assert.Equal("Restaurant", ld.GetProperty("@type").GetString());
        Assert.Equal("Brasserie de la Senne Dorée", ld.GetProperty("name").GetString());
        Assert.Equal(Canonical, ld.GetProperty("url").GetString());
        Assert.Equal("+32 2 555 01 23", ld.GetProperty("telephone").GetString());
        Assert.Equal("Rue des Fabriques 25, 1000 Bruxelles", ld.GetProperty("address").GetProperty("streetAddress").GetString());
        Assert.Equal("PostalAddress", ld.GetProperty("address").GetProperty("@type").GetString());
        Assert.Equal(["brasserie", "cuisine belge"], ld.GetProperty("servesCuisine").EnumerateArray().Select(e => e.GetString()));

        JsonElement[] hours = ld.GetProperty("openingHoursSpecification").EnumerateArray().ToArray();
        Assert.Equal(6, hours.Length);
        Assert.DoesNotContain(hours, h => h.GetProperty("dayOfWeek").GetString() == "Monday");
        Assert.All(hours, h =>
        {
            Assert.Equal("11:30", h.GetProperty("opens").GetString());
            Assert.Equal("22:30", h.GetProperty("closes").GetString());
        });

        JsonElement section = ld.GetProperty("hasMenu").GetProperty("hasMenuSection").EnumerateArray().Single();
        Assert.Equal("Plats", section.GetProperty("name").GetString());
        Assert.Equal(3, section.GetProperty("hasMenuItem").GetArrayLength());
    }

    [Fact]
    public void Build_PricesADishInItsCurrency_AndMarksASoldOutOneOutOfStock()
    {
        JsonElement[] items = Parse(SiteSamples.Full()).GetProperty("hasMenu").GetProperty("hasMenuSection")[0]
            .GetProperty("hasMenuItem").EnumerateArray().ToArray();

        JsonElement carbonade = items[0].GetProperty("offers");
        Assert.Equal("22.00", carbonade.GetProperty("price").GetString());
        Assert.Equal("EUR", carbonade.GetProperty("priceCurrency").GetString());
        Assert.Equal("https://schema.org/InStock", carbonade.GetProperty("availability").GetString());

        Assert.False(items[1].TryGetProperty("offers", out _), "a price on request has no offer");
        Assert.Equal("https://schema.org/OutOfStock", items[2].GetProperty("offers").GetProperty("availability").GetString());
        Assert.Equal("https://schema.org/VegetarianDiet", items[2].GetProperty("suitableForDiet")[0].GetString());
    }

    [Fact]
    public void Build_UsesAbsoluteAddressesForImagesAndTheReservationTarget()
    {
        JsonElement ld = Parse(SiteSamples.Full());

        Assert.Equal("https://resto.example.be/media/site-cover-AbC123.jpg", ld.GetProperty("image")[0].GetString());
        Assert.Equal(4, ld.GetProperty("image").GetArrayLength());
        Assert.Equal("https://resto.example.be/media/site-logo-AbC123.png", ld.GetProperty("logo").GetString());
        Assert.Equal("https://resto.example.be" + BookPath, ld.GetProperty("potentialAction").GetProperty("target").GetProperty("urlTemplate").GetString());
        Assert.True(ld.GetProperty("acceptsReservations").GetBoolean());
    }

    [Fact]
    public void Build_ForAWalkInOnlyLocation_OffersNoReservation()
    {
        JsonElement ld = Parse(SiteSamples.Full(m => m with { WalkInOnly = true }));

        Assert.False(ld.GetProperty("acceptsReservations").GetBoolean());
        Assert.False(ld.TryGetProperty("potentialAction", out _));
    }

    [Fact]
    public void Build_LinksTheSocialProfilesAsSameAs_ButOnlyWebAddresses()
    {
        JsonElement ld = Parse(SiteSamples.Full(m => m with
        {
            SocialLinks = [new SiteSocialLink("Facebook", "https://facebook.com/senne"), new SiteSocialLink("X", "javascript:alert(1)")],
        }));

        Assert.Equal(["https://facebook.com/senne"], ld.GetProperty("sameAs").EnumerateArray().Select(e => e.GetString()));
    }

    [Fact]
    public void Build_LeavesOutWhatIsNotThere()
    {
        JsonElement ld = Parse(SiteSamples.Full(m => m with
        {
            Tagline = null, Phone = null, Email = null, Address = null, Cuisines = [], Menus = [], Photos = [], CoverUrl = null,
            LogoUrl = null, SocialLinks = [], Hours = [],
        }));

        foreach (string key in new[] { "description", "telephone", "email", "address", "servesCuisine", "hasMenu", "image", "logo", "sameAs", "openingHoursSpecification" })
        {
            Assert.False(ld.TryGetProperty(key, out _), key);
        }
    }

    [Fact]
    public void Build_CannotBeClosedEarlyByAScriptTagInAField()
    {
        string json = SiteStructuredData.Build(
            SiteSamples.Full(m => m with { Name = "</script><script>alert(1)</script>", Tagline = "<!-- & -->" }), Canonical, BookPath);

        Assert.DoesNotContain("</script", json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain('<', json);
        Assert.DoesNotContain('>', json);
        Assert.Equal("</script><script>alert(1)</script>", JsonDocument.Parse(json).RootElement.GetProperty("name").GetString());
    }

    [Fact]
    public void Build_NamesTheSectionAfterTheMenu_WhenThereAreSeveral()
    {
        SitePageModel model = SiteSamples.Full(m => m with
        {
            Menus = [m.Menus[0], new PublicMenuView("Boissons", null, "EUR", [new PublicMenuCategoryView("Bières", null, [new PublicMenuItemView("Triple", null, 600, null, false, Allergens.Gluten, DietaryTags.None)])])],
        });

        string[] names = Parse(model).GetProperty("hasMenu").GetProperty("hasMenuSection").EnumerateArray()
            .Select(s => s.GetProperty("name").GetString()!).ToArray();

        Assert.Equal(["La carte – Plats", "Boissons – Bières"], names);
    }

    [Fact]
    public void Build_WritesTheMenuAndTheReserveActionInTheLanguageOfThePage()
    {
        JsonElement french = Parse(SiteSamples.Full());
        JsonElement dutch = Parse(SiteSamples.Full(m => m with { Language = "nl" }));

        Assert.Equal("Carte de Brasserie de la Senne Dorée", french.GetProperty("hasMenu").GetProperty("name").GetString());
        Assert.Equal("fr", french.GetProperty("hasMenu").GetProperty("inLanguage").GetString());
        Assert.Equal("Réserver une table", french.GetProperty("potentialAction").GetProperty("name").GetString());
        Assert.Equal("fr", french.GetProperty("potentialAction").GetProperty("target").GetProperty("inLanguage").GetString());

        Assert.Equal("Menukaart van Brasserie de la Senne Dorée", dutch.GetProperty("hasMenu").GetProperty("name").GetString());
        Assert.Equal("nl", dutch.GetProperty("hasMenu").GetProperty("inLanguage").GetString());
        Assert.Equal("Reserveer een tafel", dutch.GetProperty("potentialAction").GetProperty("name").GetString());
        Assert.Equal("nl", dutch.GetProperty("potentialAction").GetProperty("target").GetProperty("inLanguage").GetString());
    }

    [Fact]
    public void Build_KeepsTheEnglishDayNamesSchemaOrgAsksFor_InEveryLanguage()
    {
        SitePageModel model = SiteSamples.Full(m => m with { Language = "nl", Hours = [new SiteDayHours(1, "10:00", "12:00")] });

        Assert.Equal("Monday", Parse(model).GetProperty("openingHoursSpecification")[0].GetProperty("dayOfWeek").GetString());
    }

    [Fact]
    public void TheRenderedPage_CarriesTheSameStructuredDataBlock()
    {
        string html = SiteSamples.Html();

        Match block = Regex.Match(html, "<script type=\"application/ld\\+json\">(.*?)</script>", RegexOptions.Singleline);
        Assert.True(block.Success);
        Assert.Equal("Restaurant", JsonDocument.Parse(block.Groups[1].Value).RootElement.GetProperty("@type").GetString());
    }
}
