using System.Security.Cryptography;
using System.Text;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Site;

/// <summary>A rendered page and the policy that goes with it, which hashes the page's one stylesheet.</summary>
public sealed record RenderedSitePage(string Html, string ContentSecurityPolicy)
{
    /// <summary>What the page was written from, so a caller can write the same page again in another <see cref="SitePageModel.Language"/>.</summary>
    public SitePageModel? Model { get; init; }

    /// <summary>This page in <paramref name="language"/>: itself when it is already written in it, or when it carries no model to write again.</summary>
    /// <seealso>SitePageRendererTests.In_WritesTheSamePageInTheOtherLanguage</seealso>
    public RenderedSitePage In(string language)
        => Model is null || SiteCopy.For(language) == SiteCopy.For(Model.Language)
            ? this
            : SitePageRenderer.Render(Model with { Language = language });
}

/// <summary>
/// Writes a site as one self-contained HTML document: inline stylesheet, no script, no web font,
/// no third-party request. That is what keeps it fast on an old phone, indexable without running
/// anything, and free of a cookie banner — there is nothing for a banner to ask about.
/// <para>
/// Every value that came from a person is escaped, every URL is checked against the scheme or path it is allowed to be before it is written, and
/// the policy in <see cref="RenderedSitePage.ContentSecurityPolicy"/> forbids the rest: an
/// escaping mistake here still cannot load a script or a remote image.
/// </para>
/// </summary>
/// <seealso>SitePageRendererTests.Render_EscapesEveryTextFieldAThirdPartyCanWrite</seealso>
/// <seealso>SitePageRendererTests.Render_LoadsNothingFromAnotherOrigin</seealso>
public static class SitePageRenderer
{
    private const string MediaPrefix = "/media/";

    public static RenderedSitePage Render(SitePageModel m)
    {
        SiteCopy c = SiteCopy.For(m.Language);
        string css = SiteThemes.Css(m.Theme, m.PrimaryColor);
        string policy = ContentSecurityPolicyFor(css);

        string pagePath = $"/r/{m.Slug}";
        string canonical = SiteFormat.AbsoluteUrl(m.BaseUrl, pagePath);
        string bookPath = $"{pagePath}/reserver";
        string bookHref = SiteLanguage.WithLanguage(bookPath, c.Language);
        bool canBook = !m.WalkInOnly;
        string? phoneHref = SiteFormat.PhoneHref(m.Phone);
        string title = c.TitleFor(m.Name, canBook);
        string description = Description(m, c, canBook);
        string? shareImage = m.CoverUrl ?? m.Photos.FirstOrDefault()?.Url ?? m.LogoUrl;

        var sb = new StringBuilder(16 * 1024);
        sb.Append("<!doctype html>\n<html lang=\"").Append(c.Language).Append("\">\n<head>\n<meta charset=\"utf-8\">\n");
        sb.Append("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n");
        sb.Append("<meta http-equiv=\"Content-Security-Policy\" content=\"").Append(E(MetaContentSecurityPolicyFor(css))).Append("\">\n");
        sb.Append("<meta name=\"referrer\" content=\"strict-origin-when-cross-origin\">\n");
        sb.Append("<title>").Append(E(title)).Append("</title>\n");
        sb.Append("<meta name=\"description\" content=\"").Append(E(description)).Append("\">\n");
        sb.Append(m.IsDraft
            ? "<meta name=\"robots\" content=\"noindex,nofollow\">\n"
            : "<meta name=\"robots\" content=\"index,follow,max-image-preview:large\">\n");
        sb.Append("<meta name=\"theme-color\" content=\"").Append(E(SiteThemes.PaletteFor(m.Theme, m.PrimaryColor).Background.Hex)).Append("\">\n");
        sb.Append("<link rel=\"canonical\" href=\"").Append(E(canonical)).Append("\">\n");
        foreach (string language in new[] { SiteLanguage.French, SiteLanguage.Dutch, SiteLanguage.English })
        {
            sb.Append("<link rel=\"alternate\" hreflang=\"").Append(language).Append("\" href=\"")
                .Append(E(SiteLanguage.WithLanguage(canonical, language))).Append("\">\n");
        }
        sb.Append("<link rel=\"alternate\" hreflang=\"x-default\" href=\"").Append(E(canonical)).Append("\">\n");
        sb.Append("<meta property=\"og:type\" content=\"restaurant.restaurant\">\n");
        sb.Append("<meta property=\"og:locale\" content=\"").Append(c.OgLocale).Append("\">\n");
        sb.Append("<meta property=\"og:site_name\" content=\"").Append(E(m.Name)).Append("\">\n");
        sb.Append("<meta property=\"og:title\" content=\"").Append(E(title)).Append("\">\n");
        sb.Append("<meta property=\"og:description\" content=\"").Append(E(description)).Append("\">\n");
        sb.Append("<meta property=\"og:url\" content=\"").Append(E(canonical)).Append("\">\n");
        if (MediaPath(shareImage) is { } image)
        {
            sb.Append("<meta property=\"og:image\" content=\"").Append(E(SiteFormat.AbsoluteUrl(m.BaseUrl, image))).Append("\">\n");
            sb.Append("<meta name=\"twitter:card\" content=\"summary_large_image\">\n");
        }
        sb.Append("<style>").Append(css).Append("</style>\n");
        sb.Append("<script type=\"application/ld+json\">").Append(SiteStructuredData.Build(m, canonical, bookPath)).Append("</script>\n");
        sb.Append("</head>\n<body>\n");
        sb.Append("<a class=\"skip\" href=\"#contenu\">").Append(E(c.SkipLink)).Append("</a>\n");
        if (m.IsDraft)
        {
            sb.Append("<div class=\"draft\" role=\"status\">").Append(E(c.DraftBanner)).Append("</div>\n");
        }

        AppendLanguageSwitch(sb, c, pagePath);
        AppendHeader(sb, m, c, bookHref, canBook, phoneHref);
        AppendNav(sb, m, c);
        sb.Append("<main id=\"contenu\">\n");
        AppendMenu(sb, m, c);
        AppendHours(sb, m, c);
        AppendGallery(sb, m, c);
        AppendContact(sb, m, c, bookHref, canBook, phoneHref);
        sb.Append("</main>\n");
        AppendFooter(sb, m, c);
        if (canBook)
        {
            sb.Append("<div class=\"book-bar\"><a class=\"btn\" href=\"").Append(E(bookHref)).Append("\">").Append(E(c.BookTable)).Append("</a></div>\n");
        }
        sb.Append("</body>\n</html>\n");

        return new RenderedSitePage(sb.ToString(), policy) { Model = m };
    }

    /// <summary>The bare page an unknown, unpublished or archived address answers: it names no site, so it says nothing about which sites exist.</summary>
    /// <seealso>SitePageRendererTests.NotFoundPage_IsWrittenInTheRequestedLanguage_AndNamesNoSite</seealso>
    public static string NotFoundPage(string? language)
    {
        SiteCopy c = SiteCopy.For(language);
        return "<!doctype html><html lang=\"" + c.Language + "\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            + "<meta name=\"robots\" content=\"noindex\"><title>" + E(c.NotFoundTitle) + "</title></head>"
            + "<body style=\"font:1.1rem/1.6 system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem\">"
            + "<h1>" + E(c.NotFoundTitle) + "</h1><p>" + E(c.NotFoundBody) + "</p></body></html>";
    }

    /// <summary>
    /// Nothing but this origin's images and the one stylesheet, named by its hash so the page
    /// needs no per-request nonce and stays identical (and cacheable) for every visitor.
    /// </summary>
    public static string ContentSecurityPolicyFor(string css)
        => $"{MetaContentSecurityPolicyFor(css)}; {FrameAncestors}";

    /// <summary>
    /// The same policy without <c>frame-ancestors</c>, which a browser ignores in a <c>meta</c>
    /// element and reports in the console on every visit; the header carries it.
    /// </summary>
    /// <seealso>SitePageRendererTests.ContentSecurityPolicy_KeepsFrameAncestorsInTheHeaderOnly</seealso>
    public static string MetaContentSecurityPolicyFor(string css)
    {
        string hash = Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(css)));
        return $"default-src 'none'; img-src 'self'; style-src 'sha256-{hash}'; base-uri 'none'; form-action 'none'";
    }

    private const string FrameAncestors = "frame-ancestors 'none'";

    /// <summary>Plain links rather than a control: the page runs no script, and a link to the same page with the other language is what a crawler follows too.</summary>
    private static void AppendLanguageSwitch(StringBuilder sb, SiteCopy current, string pagePath)
    {
        sb.Append("<nav class=\"lang\" aria-label=\"").Append(E(current.SwitchLabel)).Append("\"><div class=\"wrap\">");
        foreach (SiteCopy option in new[] { SiteCopy.French, SiteCopy.Dutch, SiteCopy.English })
        {
            if (option.Language != SiteCopy.French.Language)
            {
                sb.Append("<span aria-hidden=\"true\">|</span>");
            }
            sb.Append("<a href=\"").Append(E(SiteLanguage.WithLanguage(pagePath, option.Language))).Append("\" lang=\"").Append(option.Language)
                .Append("\" hreflang=\"").Append(option.Language).Append("\" aria-label=\"").Append(E(option.LanguageName)).Append('"')
                .Append(option == current ? " aria-current=\"true\"" : "").Append('>')
                .Append(option.Language.ToUpperInvariant()).Append("</a>");
        }
        sb.Append("</div></nav>\n");
    }

    private static void AppendHeader(StringBuilder sb, SitePageModel m, SiteCopy c, string bookHref, bool canBook, string? phoneHref)
    {
        string? cover = MediaPath(m.CoverUrl);
        string? logo = MediaPath(m.LogoUrl);

        sb.Append("<header class=\"hero").Append(cover is null ? "" : " has-cover").Append("\">\n");
        if (cover is not null)
        {
            sb.Append("<img class=\"cover\" src=\"").Append(E(cover)).Append("\" alt=\"\" fetchpriority=\"high\" decoding=\"async\">\n");
        }
        sb.Append("<div class=\"wrap\">\n");
        if (logo is not null)
        {
            sb.Append("<img class=\"logo\" src=\"").Append(E(logo)).Append("\" alt=\"").Append(E(c.LogoAlt(m.Name))).Append("\">\n");
        }
        sb.Append("<h1>").Append(E(m.Name)).Append("</h1>\n");
        if (!string.IsNullOrWhiteSpace(m.Tagline))
        {
            sb.Append("<p class=\"tagline\">").Append(E(m.Tagline)).Append("</p>\n");
        }
        sb.Append("<div class=\"actions\">\n");
        if (canBook)
        {
            sb.Append("<a class=\"btn\" href=\"").Append(E(bookHref)).Append("\">").Append(E(c.BookTable)).Append("</a>\n");
        }
        if (m.Menus.Count > 0)
        {
            sb.Append("<a class=\"btn alt\" href=\"#carte\">").Append(E(c.SeeMenu)).Append("</a>\n");
        }
        if (phoneHref is not null)
        {
            sb.Append("<a class=\"btn alt\" href=\"").Append(E(phoneHref)).Append("\">").Append(E(c.Call)).Append("</a>\n");
        }
        sb.Append("</div>\n");
        if (!canBook)
        {
            sb.Append("<p class=\"note\">").Append(E(c.NoOnlineBooking)).Append("</p>\n");
        }
        sb.Append("</div>\n</header>\n");
    }

    private static void AppendNav(StringBuilder sb, SitePageModel m, SiteCopy c)
    {
        var links = new List<(string Href, string Label)>();
        if (m.Menus.Count > 0) links.Add(("#carte", c.NavMenu));
        links.Add(("#horaires", c.NavHours));
        if (m.Photos.Count > 0) links.Add(("#galerie", c.NavGallery));
        links.Add(("#contact", c.NavContact));

        sb.Append("<nav class=\"sections\" aria-label=\"").Append(E(c.NavLabel)).Append("\"><div class=\"wrap\"><ul>");
        foreach ((string href, string label) in links)
        {
            sb.Append("<li><a href=\"").Append(href).Append("\">").Append(E(label)).Append("</a></li>");
        }
        sb.Append("</ul></div></nav>\n");
    }

    private static void AppendMenu(StringBuilder sb, SitePageModel m, SiteCopy c)
    {
        if (m.Menus.Count == 0)
        {
            return;
        }

        sb.Append("<section id=\"carte\" aria-labelledby=\"t-carte\"><div class=\"wrap\">\n<h2 id=\"t-carte\">").Append(E(c.MenuHeading)).Append("</h2>\n");
        sb.Append("<p class=\"lede\">").Append(E(c.AllergenNote)).Append("</p>\n");
        foreach (PublicMenuView menu in m.Menus)
        {
            // One menu is the section's own heading already; a heading only earns its place when it tells menus apart.
            if (m.Menus.Count > 1)
            {
                sb.Append("<h3>").Append(E(menu.Name)).Append("</h3>\n");
            }
            if (!string.IsNullOrWhiteSpace(menu.Description))
            {
                sb.Append("<p class=\"lede\">").Append(E(menu.Description)).Append("</p>\n");
            }
            foreach (PublicMenuCategoryView category in menu.Categories.Where(c => c.Items.Count > 0))
            {
                string level = m.Menus.Count > 1 ? "h4" : "h3";
                sb.Append('<').Append(level).Append(" class=\"cat\">").Append(E(category.Name)).Append("</").Append(level).Append(">\n");
                if (!string.IsNullOrWhiteSpace(category.Description))
                {
                    sb.Append("<p class=\"lede\">").Append(E(category.Description)).Append("</p>\n");
                }
                sb.Append("<ul class=\"dishes\">\n");
                foreach (PublicMenuItemView item in category.Items)
                {
                    AppendDish(sb, item, c, menu.Currency);
                }
                sb.Append("</ul>\n");
            }
        }
        sb.Append("</div></section>\n");
    }

    private static void AppendDish(StringBuilder sb, PublicMenuItemView item, SiteCopy c, string currency)
    {
        item = item.In(c.Language);
        sb.Append(item.SoldOut ? "<li class=\"dish off\">" : "<li class=\"dish\">");
        sb.Append("<span class=\"nm\">").Append(E(item.Name)).Append("</span>");
        sb.Append("<span class=\"pr\">")
            .Append(item.PriceMinor is { } price ? E(SiteFormat.Price(price, currency, c)) : E(c.PriceOnRequest))
            .Append("</span>");
        if (!string.IsNullOrWhiteSpace(item.Description))
        {
            sb.Append("<p class=\"ds\">").Append(E(item.Description)).Append("</p>");
        }

        IReadOnlyList<string> diets = c.DietLabels(item.DietaryTags);
        IReadOnlyList<string> allergens = c.AllergenLabels(item.Allergens);
        if (item.SoldOut || diets.Count > 0 || allergens.Count > 0)
        {
            sb.Append("<p class=\"meta\">");
            if (item.SoldOut) sb.Append("<span class=\"badge\">").Append(E(c.SoldOut)).Append("</span>");
            foreach (string diet in diets) sb.Append("<span class=\"badge\">").Append(E(diet)).Append("</span>");
            if (allergens.Count > 0) sb.Append(E(c.AllergensPrefix)).Append(E(string.Join(", ", allergens)));
            sb.Append("</p>");
        }

        if (MediaPath(item.ImageUrl) is { } image)
        {
            sb.Append("<img src=\"").Append(E(image)).Append("\" alt=\"").Append(E(item.Name)).Append("\" width=\"96\" height=\"72\" loading=\"lazy\" decoding=\"async\">");
        }
        sb.Append("</li>\n");
    }

    private static void AppendHours(StringBuilder sb, SitePageModel m, SiteCopy c)
    {
        sb.Append("<section id=\"horaires\" aria-labelledby=\"t-horaires\"><div class=\"wrap\">\n<h2 id=\"t-horaires\">").Append(E(c.HoursHeading)).Append("</h2>\n");
        sb.Append("<table class=\"hours\"><caption class=\"sr-only\">").Append(E(c.HoursCaption)).Append("</caption><tbody>\n");
        foreach (SiteDayHours day in m.Hours)
        {
            sb.Append("<tr><th scope=\"row\">").Append(c.Day(day.IsoDay)).Append("</th><td>");
            sb.Append(day.Open is { } open && day.Close is { } close
                ? E(SiteFormat.TimeRange(open, close))
                : $"<span class=\"closed\">{E(c.Closed)}</span>");
            sb.Append("</td></tr>\n");
        }
        sb.Append("</tbody></table>\n</div></section>\n");
    }

    private static void AppendGallery(StringBuilder sb, SitePageModel m, SiteCopy c)
    {
        List<SitePhoto> photos = m.Photos.Where(p => MediaPath(p.Url) is not null).ToList();
        if (photos.Count == 0)
        {
            return;
        }

        sb.Append("<section id=\"galerie\" aria-labelledby=\"t-galerie\"><div class=\"wrap\">\n<h2 id=\"t-galerie\">").Append(E(c.GalleryHeading)).Append("</h2>\n<ul class=\"gallery\">\n");
        foreach (SitePhoto photo in photos)
        {
            sb.Append("<li><img src=\"").Append(E(photo.Url)).Append("\" alt=\"").Append(E(photo.Alt))
                .Append("\" width=\"").Append(photo.Width).Append("\" height=\"").Append(photo.Height)
                .Append("\" loading=\"lazy\" decoding=\"async\"></li>\n");
        }
        sb.Append("</ul>\n</div></section>\n");
    }

    private static void AppendContact(StringBuilder sb, SitePageModel m, SiteCopy c, string bookHref, bool canBook, string? phoneHref)
    {
        string newTab = $"<span class=\"sr-only\">{E(c.OpensInNewTab)}</span>";
        sb.Append("<section id=\"contact\" aria-labelledby=\"t-contact\"><div class=\"wrap\">\n<h2 id=\"t-contact\">").Append(E(c.FindUsHeading)).Append("</h2>\n<div class=\"contact\">\n<div>\n");
        if (!string.IsNullOrWhiteSpace(m.Address))
        {
            sb.Append("<address>").Append(E(m.Address)).Append("</address>\n");
            sb.Append("<p><a href=\"").Append(E(SiteFormat.MapUrl(m.Address))).Append("\" target=\"_blank\" rel=\"noopener noreferrer\">").Append(E(c.ViewOnMap)).Append(newTab).Append("</a></p>\n");
        }
        if (phoneHref is not null)
        {
            sb.Append("<p>").Append(E(c.PhonePrefix)).Append("<a href=\"").Append(E(phoneHref)).Append("\">").Append(E(m.Phone)).Append("</a></p>\n");
        }
        if (!string.IsNullOrWhiteSpace(m.Email) && EmailValidator.IsValid(m.Email))
        {
            sb.Append("<p>").Append(E(c.EmailPrefix)).Append("<a href=\"mailto:").Append(E(m.Email)).Append("\">").Append(E(m.Email)).Append("</a></p>\n");
        }
        sb.Append("</div>\n<div>\n");
        if (canBook)
        {
            sb.Append("<p><a class=\"btn\" href=\"").Append(E(bookHref)).Append("\">").Append(E(c.BookTable)).Append("</a></p>\n");
        }
        List<SiteSocialLink> links = m.SocialLinks.Where(l => SiteFormat.IsSecureUrl(l.Url)).ToList();
        if (links.Count > 0)
        {
            sb.Append("<ul class=\"social\" aria-label=\"").Append(E(c.SocialLabel)).Append("\">\n");
            foreach (SiteSocialLink link in links)
            {
                sb.Append("<li><a href=\"").Append(E(link.Url)).Append("\" target=\"_blank\" rel=\"noopener noreferrer me\">")
                    .Append(E(link.Kind)).Append(newTab).Append("</a></li>\n");
            }
            sb.Append("</ul>\n");
        }
        sb.Append("</div>\n</div>\n</div></section>\n");
    }

    private static void AppendFooter(StringBuilder sb, SitePageModel m, SiteCopy c)
    {
        sb.Append("<footer><div class=\"wrap\">\n<h2 id=\"mentions-legales\">").Append(E(c.LegalHeading)).Append("</h2>\n<dl>\n");
        Row(sb, c.LegalEstablishment, m.Name);
        Row(sb, c.LegalCompanyName, m.LegalName);
        Row(sb, c.LegalCompanyNumber, m.CompanyNumber);
        Row(sb, c.LegalVatNumber, m.VatNumber);
        Row(sb, c.LegalSeat, m.LegalAddress ?? m.Address);
        Row(sb, c.LegalContact, m.Email ?? m.Phone);
        sb.Append("</dl>\n");
        sb.Append("<p>").Append(E(c.NoCookies)).Append("</p>\n");
        if (m.PrivacyPolicyUrl is { } privacy && UrlValidator.IsValid(privacy, UrlValidator.WebSchemes))
        {
            sb.Append("<p><a href=\"").Append(E(privacy)).Append("\" target=\"_blank\" rel=\"noopener noreferrer\">").Append(E(c.PrivacyPolicy))
                .Append("<span class=\"sr-only\">").Append(E(c.OpensInNewTab)).Append("</span></a></p>\n");
        }
        sb.Append("</div></footer>\n");
    }

    private static void Row(StringBuilder sb, string label, string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            sb.Append("<dt>").Append(E(label)).Append("</dt><dd>").Append(E(value)).Append("</dd>\n");
        }
    }

    private static string Description(SitePageModel m, SiteCopy c, bool canBook)
    {
        string lead = !string.IsNullOrWhiteSpace(m.Tagline)
            ? m.Tagline.Trim().TrimEnd('.') + "."
            : c.DefaultLead(m.Name);
        string where = string.IsNullOrWhiteSpace(m.Address) ? "" : $" {m.Address.Trim().TrimEnd('.')}.";
        return SiteFormat.Truncate(lead + where + c.DescriptionTail(canBook), 160);
    }

    /// <summary>The path when it points into this instance's media directory, otherwise null: an image is never loaded from anywhere else.</summary>
    private static string? MediaPath(string? url)
        => url is not null && url.StartsWith(MediaPrefix, StringComparison.Ordinal) && !url.Contains("..", StringComparison.Ordinal) && !url.Contains("//", StringComparison.Ordinal)
            ? url
            : null;

    /// <summary>
    /// Escapes the five characters that can end a text node or an attribute value and nothing
    /// else. <see cref="WebUtility.HtmlEncode(string?)"/> would also turn every accented letter
    /// into a numeric entity, which is valid but triples the weight of French text and makes the
    /// source unreadable.
    /// </summary>
    private static string E(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        var sb = new StringBuilder(value.Length + 16);
        foreach (char c in value)
        {
            sb.Append(c switch
            {
                '&' => "&amp;",
                '<' => "&lt;",
                '>' => "&gt;",
                '"' => "&quot;",
                '\'' => "&#39;",
                _ => c.ToString(),
            });
        }
        return sb.ToString();
    }
}
