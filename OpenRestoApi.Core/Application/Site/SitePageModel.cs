using OpenRestoApi.Core.Domain;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Utilities;

namespace OpenRestoApi.Core.Application.Site;

/// <summary>
/// Everything a site page shows, already resolved: which hours apply, which phone wins over the
/// brand's, which dishes are published. The renderer takes this and nothing else, so it needs no
/// database and a test can build one by hand.
/// </summary>
public sealed record SitePageModel
{
    public required string Slug { get; init; }
    public required string Name { get; init; }
    public string? Tagline { get; init; }
    public SiteTheme Theme { get; init; } = SiteTheme.Brasserie;

    /// <summary>The brand's <c>#rrggbb</c>; the renderer corrects it wherever it carries text.</summary>
    public string PrimaryColor { get; init; } = DefaultPrimaryColor;

    public const string DefaultPrimaryColor = "#0a7ea4";

    /// <summary>The instance's public address with no trailing slash, for the absolute URLs a crawler needs.</summary>
    public required string BaseUrl { get; init; }

    public string? LogoUrl { get; init; }
    public string? CoverUrl { get; init; }
    public IReadOnlyList<SitePhoto> Photos { get; init; } = [];
    public IReadOnlyList<SiteSocialLink> SocialLinks { get; init; } = [];

    public string? Address { get; init; }
    public string? Phone { get; init; }
    public string? Email { get; init; }
    public IReadOnlyList<string> Cuisines { get; init; } = [];

    /// <summary>Monday to Sunday, in that order, always seven entries.</summary>
    public IReadOnlyList<SiteDayHours> Hours { get; init; } = [];

    public IReadOnlyList<PublicMenuView> Menus { get; init; } = [];

    /// <summary>True for a walk-in-only location: the page drops the booking button and says so.</summary>
    public bool WalkInOnly { get; init; }

    public string? LegalName { get; init; }
    public string? CompanyNumber { get; init; }
    public string? VatNumber { get; init; }
    public string? LegalAddress { get; init; }
    public string? PrivacyPolicyUrl { get; init; }

    /// <summary>Set for the admin's preview of a site that is not live: noindex, and a banner saying so.</summary>
    public bool IsDraft { get; init; }

    /// <summary>The language the page is written in, one of <see cref="SiteLanguage"/>'s; anything else is read as French.</summary>
    public string Language { get; init; } = SiteLanguage.Default;
}

/// <param name="IsoDay">1 = Monday … 7 = Sunday.</param>
/// <param name="Open">Null when the restaurant is closed that day.</param>
public sealed record SiteDayHours(int IsoDay, string? Open, string? Close);

/// <summary>A published menu as the site shows it.</summary>
public sealed record PublicMenuView(string Name, string? Description, string Currency, IReadOnlyList<PublicMenuCategoryView> Categories);

public sealed record PublicMenuCategoryView(string Name, string? Description, IReadOnlyList<PublicMenuItemView> Items);

/// <param name="PriceMinor">Null is "price on request", which is not the same as free (0).</param>
public sealed record PublicMenuItemView(
    string Name,
    string? Description,
    long? PriceMinor,
    string? ImageUrl,
    bool SoldOut,
    Allergens Allergens,
    DietaryTags DietaryTags,
    string PrimaryLanguage = "fr",
    Dictionary<string, MenuItemTranslationDto>? Translations = null)
{
    public PublicMenuItemView In(string language)
    {
        var text = MenuTranslations.Resolve(Name, Description, PrimaryLanguage, Translations ?? [], language);
        return this with { Name = text.Name!, Description = text.Description };
    }
}
