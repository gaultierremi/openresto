namespace OpenRestoApi.Core.Domain;

/// <summary>
/// The one-page public website generated for a restaurant. Everything the page shows that is not
/// stored here (name, address, hours, contact, menu) is read from the restaurant at render time,
/// so editing a location is enough to update its site. Guests only ever reach a published one.
/// </summary>
public class RestaurantSite
{
    public int Id { get; set; }

    public int RestaurantId { get; set; }
    public Restaurant? Restaurant { get; set; }

    /// <summary>The public address, <c>/r/{slug}</c>. See <see cref="SiteSlug"/>.</summary>
    public string Slug { get; set; } = null!;

    public bool IsPublished { get; set; }

    public SiteTheme Theme { get; set; } = SiteTheme.Brasserie;

    /// <summary>
    /// The restaurant's own <c>#rrggbb</c> for this site. Null keeps the instance's brand colour,
    /// which is also what the booking and menu pages use.
    /// </summary>
    public string? PrimaryColor { get; set; }

    public string? Tagline { get; set; }

    /// <summary>A <c>/media/</c> URL under a random <c>site-</c> name, never the restaurant's id.</summary>
    public string? LogoUrl { get; set; }
    public string? CoverUrl { get; set; }

    /// <summary>The gallery as JSON (see <see cref="SitePhoto"/>); read it through <see cref="SiteContent"/>.</summary>
    public string? PhotosJson { get; set; }

    /// <summary>The social links as JSON (see <see cref="SiteSocialLink"/>); read it through <see cref="SiteContent"/>.</summary>
    public string? SocialLinksJson { get; set; }

    /// <summary>Who runs the business, as the legal notice names it.</summary>
    public string? LegalName { get; set; }
    public string? CompanyNumber { get; set; }
    public string? VatNumber { get; set; }
    public string? LegalAddress { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

/// <summary>
/// The three looks of a site. Stored by name, so reordering this enum moves nothing.
/// </summary>
public enum SiteTheme
{
    Brasserie,
    Gastronomique,
    Cafe,
}

/// <summary>One gallery photo. <see cref="Id"/> is a random token that only the admin ever sees.</summary>
public sealed record SitePhoto(string Id, string Url, string Alt, int Width, int Height);

/// <summary>One link in the footer of a site. <see cref="Kind"/> is one of <see cref="SiteContent.SocialKinds"/>.</summary>
public sealed record SiteSocialLink(string Kind, string Url);
