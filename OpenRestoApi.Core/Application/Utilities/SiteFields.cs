using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Application.Site;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Utilities;

/// <summary>
/// Caps and normalisation for what an admin types into the "Mon site" screen. A blank value
/// clears a field, as everywhere else in the admin; a non-blank one is trimmed and bounds-checked,
/// and every refusal carries a stable code so the screen can say it in the admin's language.
/// </summary>
public static class SiteFields
{
    public const int MaxTaglineLength = 160;
    public const int MaxAltLength = 140;
    public const int MaxLegalNameLength = 120;
    public const int MaxCompanyNumberLength = 20;
    public const int MaxVatNumberLength = 20;
    public const int MaxLegalAddressLength = 200;
    public const int MaxUrlLength = 500;
    public const int MaxThemeLength = 16;

    /// <summary>Every uploaded image is capped before it is decoded; the processor then shrinks it.</summary>
    public const long MaxImageBytes = 6 * 1024 * 1024;

    private static readonly HashSet<string> HttpsOnly = new(StringComparer.OrdinalIgnoreCase) { "https" };

    public static string? NormalizeTagline(string? tagline)
    {
        string? text = Blank(tagline);
        if (text is { Length: > MaxTaglineLength })
        {
            throw TooLong(ErrorCodes.SiteTaglineTooLong, "Tagline", MaxTaglineLength);
        }
        return text;
    }

    public static string NormalizeAlt(string? alt)
    {
        string? text = Blank(alt);
        if (text is null)
        {
            throw new ValidationException("Every photo needs a text description for people who cannot see it.")
            { Code = ErrorCodes.SitePhotoAltRequired };
        }
        if (text.Length > MaxAltLength)
        {
            throw TooLong(ErrorCodes.SitePhotoAltTooLong, "Photo description", MaxAltLength);
        }
        return text;
    }

    public static SiteTheme ParseTheme(string? name)
    {
        foreach (SiteTheme theme in Enum.GetValues<SiteTheme>())
        {
            if (string.Equals(theme.ToString(), name, StringComparison.Ordinal))
            {
                return theme;
            }
        }
        throw new ValidationException("Unknown theme.") { Code = ErrorCodes.SiteThemeInvalid };
    }

    /// <summary>
    /// Null leaves the colour as it is (the brand PATCH contract), a blank value goes back to the
    /// instance's colour, and anything else must be a plain <c>#rrggbb</c>: it is written into the
    /// page's stylesheet, so no other shape gets through.
    /// </summary>
    /// <seealso>SiteFieldsTests.NormalizePrimaryColor_KeepsAnRrggbb_AndRefusesEverythingElse</seealso>
    public static (bool Change, string? Color) NormalizePrimaryColor(string? color)
    {
        if (color is null)
        {
            return (false, null);
        }

        string? text = Blank(color);
        if (text is null)
        {
            return (true, null);
        }

        if (text.Length != 7 || !SiteColors.TryParse(text, out _))
        {
            throw new ValidationException("The colour must be written #rrggbb.") { Code = ErrorCodes.SiteColorInvalid };
        }

        return (true, text.ToLowerInvariant());
    }

    public static string? NormalizeLegalName(string? value)
        => Legal(value, MaxLegalNameLength, "Legal name");

    public static string? NormalizeLegalAddress(string? value)
        => Legal(value, MaxLegalAddressLength, "Registered address");

    /// <summary>
    /// A company or VAT number as the person writes it (<c>0123.456.789</c>, <c>BE 0123 456 789</c>):
    /// letters, digits and the separators people use, kept as typed, because the page shows it as typed.
    /// </summary>
    /// <seealso>SiteFieldsTests.NormalizeIdentifier_KeepsTheSeparatorsPeopleType</seealso>
    /// <seealso>SiteFieldsTests.NormalizeIdentifier_RefusesAnythingElse</seealso>
    public static string? NormalizeIdentifier(string? value, int max, string label)
    {
        string? text = Legal(value, max, label);
        if (text is not null && !text.All(c => char.IsAsciiLetterOrDigit(c) || c is ' ' or '.' or '-' or '/'))
        {
            throw new ValidationException($"{label} may only contain letters, digits, spaces, dots, hyphens and slashes.")
            { Code = ErrorCodes.SiteLegalInvalid, Args = new Dictionary<string, object> { ["field"] = label } };
        }
        return text;
    }

    /// <summary>
    /// The links as stored: https only, one per network, listed in the order of
    /// <see cref="SiteContent.SocialKinds"/> so the footer does not depend on typing order.
    /// </summary>
    /// <seealso>SiteFieldsTests.NormalizeSocialLinks_OrdersByNetworkAndCanonicalisesTheName</seealso>
    /// <seealso>SiteFieldsTests.NormalizeSocialLinks_RefusesAnythingButAnHttpsAddress</seealso>
    /// <seealso>SiteFieldsTests.NormalizeSocialLinks_RefusesTwoLinksToTheSameNetwork</seealso>
    public static List<SiteSocialLink> NormalizeSocialLinks(IEnumerable<SiteSocialLinkDto>? links)
    {
        var result = new List<SiteSocialLink>();
        foreach (SiteSocialLinkDto link in links ?? [])
        {
            string? kind = SiteContent.SocialKinds.FirstOrDefault(k => string.Equals(k, link.Kind?.Trim(), StringComparison.OrdinalIgnoreCase));
            string url = (link.Url ?? string.Empty).Trim();
            if (kind is null || url.Length > MaxUrlLength || !UrlValidator.IsValid(url, HttpsOnly)
                || result.Any(r => r.Kind == kind))
            {
                throw new ValidationException("A social link needs a known network, an https address, and appears once.")
                { Code = ErrorCodes.SiteSocialInvalid };
            }
            result.Add(new SiteSocialLink(kind, url));
        }

        if (result.Count > SiteContent.SocialKinds.Count)
        {
            throw new ValidationException("Too many social links.") { Code = ErrorCodes.SiteSocialTooMany };
        }

        return result.OrderBy(r => SiteContent.SocialKinds.ToList().IndexOf(r.Kind)).ToList();
    }

    /// <summary>
    /// What a site still lacks before it may go live: a legal identity (the notice a Belgian
    /// business website must carry) and an e-mail address to reach the business at. Names are the
    /// field paths the screen highlights.
    /// </summary>
    /// <seealso>SiteServiceTests.Publish_RefusesASiteWithoutItsLegalIdentity_AndNothingGoesLive</seealso>
    public static List<string> MissingForPublication(RestaurantSite site, string? contactEmail)
    {
        List<string> missing = [];
        if (string.IsNullOrWhiteSpace(site.LegalName)) missing.Add(MissingLegalName);
        if (string.IsNullOrWhiteSpace(site.CompanyNumber)) missing.Add(MissingCompanyNumber);
        if (string.IsNullOrWhiteSpace(contactEmail)) missing.Add(MissingContactEmail);
        return missing;
    }

    public const string MissingLegalName = "legal.name";
    public const string MissingCompanyNumber = "legal.companyNumber";
    public const string MissingContactEmail = "contact.email";

    private static string? Legal(string? value, int max, string label)
    {
        string? text = Blank(value);
        if (text is { } t && t.Length > max)
        {
            throw TooLong(ErrorCodes.SiteLegalTooLong, label, max);
        }
        return text;
    }

    private static string? Blank(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static ValidationException TooLong(string code, string label, int max)
        => new($"{label} cannot exceed {max} characters.")
        { Code = code, Args = new Dictionary<string, object> { ["max"] = max } };
}
