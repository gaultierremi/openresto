using System.Text.Json;
using System.Text.Json.Nodes;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Site;

/// <summary>
/// The schema.org <c>Restaurant</c> description a search engine reads from the page: name, address,
/// opening hours, contact, menu and the way to reserve. Built from the same
/// <see cref="SitePageModel"/> as the visible page, so the two cannot disagree about what is
/// published.
/// <para>
/// The default JSON encoder writes the angle brackets and the ampersand as unicode escapes, which
/// is what makes the result safe to place inside a <c>script</c> element: a dish named
/// <c>&lt;/script&gt;</c> cannot end the block early.
/// </para>
/// </summary>
/// <seealso>SiteStructuredDataTests.Build_NamesTheRestaurantItsHoursAndItsPublishedMenuOnly</seealso>
/// <seealso>SiteStructuredDataTests.Build_CannotBeClosedEarlyByAScriptTagInAField</seealso>
public static class SiteStructuredData
{
    private static readonly JsonSerializerOptions _options = new();

    public static string Build(SitePageModel m, string canonicalUrl, string bookPath)
    {
        var root = new Dictionary<string, object?>
        {
            ["@context"] = "https://schema.org",
            ["@type"] = "Restaurant",
            ["name"] = m.Name,
            ["url"] = canonicalUrl,
            ["description"] = string.IsNullOrWhiteSpace(m.Tagline) ? null : m.Tagline,
            ["image"] = Images(m),
            ["logo"] = Absolute(m, m.LogoUrl),
            ["telephone"] = string.IsNullOrWhiteSpace(m.Phone) ? null : m.Phone,
            ["email"] = string.IsNullOrWhiteSpace(m.Email) ? null : m.Email,
            ["address"] = string.IsNullOrWhiteSpace(m.Address)
                ? null
                : new Dictionary<string, object?> { ["@type"] = "PostalAddress", ["streetAddress"] = m.Address },
            ["servesCuisine"] = m.Cuisines.Count == 0 ? null : m.Cuisines,
            ["openingHoursSpecification"] = OpeningHours(m),
            ["acceptsReservations"] = !m.WalkInOnly,
            ["hasMenu"] = Menu(m),
            ["sameAs"] = SameAs(m),
            ["potentialAction"] = m.WalkInOnly ? null : Reserve(m, bookPath),
        };

        JsonNode node = JsonSerializer.SerializeToNode(root, _options)!;
        RemoveNulls(node);
        return node.ToJsonString(_options);
    }

    /// <summary>A property with nothing to say is left out rather than written as <c>null</c>, which validators read as a mistake.</summary>
    private static void RemoveNulls(JsonNode? node)
    {
        switch (node)
        {
            case JsonObject obj:
                foreach (string key in obj.Where(p => p.Value is null).Select(p => p.Key).ToList())
                {
                    obj.Remove(key);
                }
                foreach (JsonNode? child in obj.Select(p => p.Value))
                {
                    RemoveNulls(child);
                }
                break;
            case JsonArray array:
                foreach (JsonNode? child in array)
                {
                    RemoveNulls(child);
                }
                break;
        }
    }

    private static List<string>? Images(SitePageModel m)
    {
        List<string> images = new[] { m.CoverUrl }
            .Concat(m.Photos.Select(p => p.Url))
            .Select(u => Absolute(m, u))
            .OfType<string>()
            .ToList();
        return images.Count == 0 ? null : images;
    }

    private static List<Dictionary<string, object?>>? OpeningHours(SitePageModel m)
    {
        List<Dictionary<string, object?>> specs = m.Hours
            .Where(d => d.Open is not null && d.Close is not null)
            .Select(d => new Dictionary<string, object?>
            {
                ["@type"] = "OpeningHoursSpecification",
                ["dayOfWeek"] = SiteFormat.SchemaDay(d.IsoDay),
                ["opens"] = d.Open,
                ["closes"] = d.Close,
            })
            .ToList();
        return specs.Count == 0 ? null : specs;
    }

    private static Dictionary<string, object?>? Menu(SitePageModel m)
    {
        if (m.Menus.Count == 0)
        {
            return null;
        }

        return new Dictionary<string, object?>
        {
            ["@type"] = "Menu",
            ["name"] = SiteCopy.For(m.Language).MenuName(m.Name),
            ["inLanguage"] = SiteCopy.For(m.Language).Language,
            ["hasMenuSection"] = m.Menus.SelectMany(menu => menu.Categories
                .Where(c => c.Items.Count > 0)
                .Select(c => new Dictionary<string, object?>
                {
                    ["@type"] = "MenuSection",
                    ["name"] = m.Menus.Count > 1 ? $"{menu.Name} – {c.Name}" : c.Name,
                    ["hasMenuItem"] = c.Items.Select(i => Item(i, menu.Currency)).ToList(),
                })).ToList(),
        };
    }

    private static Dictionary<string, object?> Item(PublicMenuItemView item, string currency) => new()
    {
        ["@type"] = "MenuItem",
        ["name"] = item.Name,
        ["description"] = string.IsNullOrWhiteSpace(item.Description) ? null : item.Description,
        ["offers"] = item.PriceMinor is { } price
            ? new Dictionary<string, object?>
            {
                ["@type"] = "Offer",
                ["price"] = SiteFormat.SchemaPrice(price, currency),
                ["priceCurrency"] = currency,
                ["availability"] = item.SoldOut ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
            }
            : null,
        ["suitableForDiet"] = Diets(item.DietaryTags),
    };

    private static List<string>? Diets(DietaryTags tags)
    {
        List<string> diets = [];
        if (tags.HasFlag(DietaryTags.Vegetarian)) diets.Add("https://schema.org/VegetarianDiet");
        if (tags.HasFlag(DietaryTags.Vegan)) diets.Add("https://schema.org/VeganDiet");
        if (tags.HasFlag(DietaryTags.GlutenFree)) diets.Add("https://schema.org/GlutenFreeDiet");
        return diets.Count == 0 ? null : diets;
    }

    private static List<string>? SameAs(SitePageModel m)
    {
        List<string> urls = m.SocialLinks
            .Select(l => l.Url)
            .Where(SiteFormat.IsSecureUrl)
            .ToList();
        return urls.Count == 0 ? null : urls;
    }

    private static Dictionary<string, object?> Reserve(SitePageModel m, string bookPath) => new()
    {
        ["@type"] = "ReserveAction",
        ["name"] = SiteCopy.For(m.Language).BookTable,
        ["target"] = new Dictionary<string, object?>
        {
            ["@type"] = "EntryPoint",
            ["urlTemplate"] = SiteFormat.AbsoluteUrl(m.BaseUrl, bookPath),
            ["inLanguage"] = SiteCopy.For(m.Language).Language,
        },
    };

    private static string? Absolute(SitePageModel m, string? url)
        => string.IsNullOrWhiteSpace(url) || !url.StartsWith("/media/", StringComparison.Ordinal)
            ? null
            : SiteFormat.AbsoluteUrl(m.BaseUrl, url);
}
