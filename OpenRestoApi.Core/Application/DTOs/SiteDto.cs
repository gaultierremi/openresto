namespace OpenRestoApi.Core.Application.DTOs;

/// <summary>
/// What the "Mon site" screen shows for one location. Nothing in it is read by guests: the public
/// page is rendered HTML, not this. A location that has never had a site saved reads as the
/// defaults it would get (<see cref="Exists"/> false, a suggested address, unpublished).
/// </summary>
public class SiteDto
{
    public bool Exists { get; set; }

    public string Slug { get; set; } = null!;

    /// <summary>Where the page lives on this instance, <c>/r/{slug}</c>.</summary>
    public string PublicPath { get; set; } = null!;

    public bool IsPublished { get; set; }

    /// <summary><c>Brasserie</c>, <c>Gastronomique</c> or <c>Cafe</c>.</summary>
    public string Theme { get; set; } = null!;

    public string? Tagline { get; set; }
    public string? LogoUrl { get; set; }
    public string? CoverUrl { get; set; }
    public List<SitePhotoDto> Photos { get; set; } = [];
    public List<SiteSocialLinkDto> SocialLinks { get; set; } = [];
    public SiteLegalDto Legal { get; set; } = new();

    /// <summary>The brand colour the site is painted with. Read-only here: it is set in the brand settings.</summary>
    public string BrandColor { get; set; } = null!;

    /// <summary>
    /// What stops the site going live, as field paths (<c>legal.name</c>, <c>legal.companyNumber</c>,
    /// <c>contact.email</c>, <c>instance.publicUrl</c>). Empty means it can be published.
    /// </summary>
    public List<string> Missing { get; set; } = [];

    public DateTime? UpdatedAt { get; set; }
}

/// <param name="Id">A random token, the handle for editing or removing this photo; it is not shown on the public page.</param>
public class SitePhotoDto
{
    public string Id { get; set; } = null!;
    public string Url { get; set; } = null!;
    public string Alt { get; set; } = null!;
    public int Width { get; set; }
    public int Height { get; set; }
}

public class SiteSocialLinkDto
{
    /// <summary>One of <c>Facebook</c>, <c>Instagram</c>, <c>TikTok</c>, <c>X</c>, <c>YouTube</c>, <c>TripAdvisor</c>, <c>LinkedIn</c>.</summary>
    public string Kind { get; set; } = null!;

    /// <summary>An https address.</summary>
    public string Url { get; set; } = null!;
}

public class SiteLegalDto
{
    public string? Name { get; set; }
    public string? CompanyNumber { get; set; }
    public string? VatNumber { get; set; }
    public string? Address { get; set; }
}

/// <summary>
/// The whole editable text of a site, replaced on every save: a null or blank value clears that
/// field. The exception is <see cref="Slug"/>, where null or blank keeps the current address.
/// </summary>
public class SaveSiteRequest
{
    public string? Slug { get; set; }
    public string Theme { get; set; } = null!;
    public string? Tagline { get; set; }
    public List<SiteSocialLinkDto>? SocialLinks { get; set; }
    public SiteLegalDto? Legal { get; set; }
}

public class SavePhotoAltRequest
{
    public string? Alt { get; set; }
}

public class ReorderSitePhotosRequest
{
    public List<string> Ids { get; set; } = [];
}
