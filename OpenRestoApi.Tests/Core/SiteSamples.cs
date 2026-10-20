using OpenRestoApi.Core.Application.Site;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Core;

/// <summary>A fully populated page model, so each test changes only the one thing it is about.</summary>
internal static class SiteSamples
{
    public static SitePageModel Full(Func<SitePageModel, SitePageModel>? change = null)
    {
        var model = new SitePageModel
        {
            Slug = "brasserie-de-la-senne-doree",
            Name = "Brasserie de la Senne Dorée",
            Tagline = "Cuisine belge de saison et bières d'abbaye",
            Theme = SiteTheme.Brasserie,
            PrimaryColor = "#b45309",
            BaseUrl = "https://resto.example.be",
            LogoUrl = "/media/site-logo-AbC123.png",
            CoverUrl = "/media/site-cover-AbC123.jpg",
            Photos =
            [
                new SitePhoto("p1", "/media/site-photo-1.jpg", "La salle aux banquettes de cuir", 1200, 800),
                new SitePhoto("p2", "/media/site-photo-2.jpg", "Une carbonade flamande", 1200, 900),
                new SitePhoto("p3", "/media/site-photo-3.jpg", "La terrasse en été", 1200, 800),
            ],
            SocialLinks = [new SiteSocialLink("Facebook", "https://facebook.com/senne"), new SiteSocialLink("Instagram", "https://instagram.com/senne")],
            Address = "Rue des Fabriques 25, 1000 Bruxelles",
            Phone = "+32 2 555 01 23",
            Email = "bonjour@senne-doree.example",
            Cuisines = ["brasserie", "cuisine belge"],
            Hours = Enumerable.Range(1, 7)
                .Select(d => d == 1 ? new SiteDayHours(d, null, null) : new SiteDayHours(d, "11:30", "22:30"))
                .ToList(),
            Menus =
            [
                new PublicMenuView("La carte", "Cuisine de saison", "EUR",
                [
                    new PublicMenuCategoryView("Plats", null,
                    [
                        new PublicMenuItemView("Carbonade flamande", "Bœuf, bière brune", 2200, "/media/dish-x.jpg", SoldOut: false, Allergens.Gluten | Allergens.Celery, DietaryTags.None),
                        new PublicMenuItemView("Poisson du jour", null, null, null, SoldOut: false, Allergens.Fish, DietaryTags.None),
                        new PublicMenuItemView("Stoemp végétarien", null, 1600, null, SoldOut: true, Allergens.Milk, DietaryTags.Vegetarian),
                    ]),
                    new PublicMenuCategoryView("Vide", null, []),
                ]),
            ],
            LegalName = "Senne Dorée SRL",
            CompanyNumber = "0123.456.789",
            VatNumber = "BE 0123.456.789",
            LegalAddress = "Rue des Fabriques 25, 1000 Bruxelles",
            PrivacyPolicyUrl = "https://resto.example.be/confidentialite",
        };
        return change is null ? model : change(model);
    }

    public static string Html(Func<SitePageModel, SitePageModel>? change = null)
        => SitePageRenderer.Render(Full(change)).Html;
}
