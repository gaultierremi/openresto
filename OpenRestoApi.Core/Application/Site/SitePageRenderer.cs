using System.Security.Cryptography;
using System.Text;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Site;

/// <summary>A rendered page and the policy that goes with it, which hashes the page's one stylesheet.</summary>
public sealed record RenderedSitePage(string Html, string ContentSecurityPolicy);

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
        string css = SiteThemes.Css(m.Theme, m.PrimaryColor);
        string policy = ContentSecurityPolicyFor(css);

        string canonical = SiteFormat.AbsoluteUrl(m.BaseUrl, $"/r/{m.Slug}");
        string bookPath = $"/r/{m.Slug}/reserver";
        bool canBook = !m.WalkInOnly;
        string? phoneHref = SiteFormat.PhoneHref(m.Phone);
        string title = $"{m.Name} – Carte, horaires et {(canBook ? "réservation" : "contact")}";
        string description = Description(m, canBook);
        string? shareImage = m.CoverUrl ?? m.Photos.FirstOrDefault()?.Url ?? m.LogoUrl;

        var sb = new StringBuilder(16 * 1024);
        sb.Append("<!doctype html>\n<html lang=\"fr\">\n<head>\n<meta charset=\"utf-8\">\n");
        sb.Append("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n");
        sb.Append("<meta http-equiv=\"Content-Security-Policy\" content=\"").Append(E(policy)).Append("\">\n");
        sb.Append("<meta name=\"referrer\" content=\"strict-origin-when-cross-origin\">\n");
        sb.Append("<title>").Append(E(title)).Append("</title>\n");
        sb.Append("<meta name=\"description\" content=\"").Append(E(description)).Append("\">\n");
        sb.Append(m.IsDraft
            ? "<meta name=\"robots\" content=\"noindex,nofollow\">\n"
            : "<meta name=\"robots\" content=\"index,follow,max-image-preview:large\">\n");
        sb.Append("<meta name=\"theme-color\" content=\"").Append(E(SiteThemes.PaletteFor(m.Theme, m.PrimaryColor).Background.Hex)).Append("\">\n");
        sb.Append("<link rel=\"canonical\" href=\"").Append(E(canonical)).Append("\">\n");
        sb.Append("<meta property=\"og:type\" content=\"restaurant.restaurant\">\n");
        sb.Append("<meta property=\"og:locale\" content=\"fr_BE\">\n");
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
        sb.Append("<a class=\"skip\" href=\"#contenu\">Aller au contenu</a>\n");
        if (m.IsDraft)
        {
            sb.Append("<div class=\"draft\" role=\"status\">Aperçu – ce site n’est pas publié : personne d’autre que vous ne le voit.</div>\n");
        }

        AppendHeader(sb, m, bookPath, canBook, phoneHref);
        AppendNav(sb, m);
        sb.Append("<main id=\"contenu\">\n");
        AppendMenu(sb, m);
        AppendHours(sb, m);
        AppendGallery(sb, m);
        AppendContact(sb, m, bookPath, canBook, phoneHref);
        sb.Append("</main>\n");
        AppendFooter(sb, m);
        if (canBook)
        {
            sb.Append("<div class=\"book-bar\"><a class=\"btn\" href=\"").Append(E(bookPath)).Append("\">Réserver une table</a></div>\n");
        }
        sb.Append("</body>\n</html>\n");

        return new RenderedSitePage(sb.ToString(), policy);
    }

    /// <summary>
    /// Nothing but this origin's images and the one stylesheet, named by its hash so the page
    /// needs no per-request nonce and stays identical (and cacheable) for every visitor.
    /// </summary>
    public static string ContentSecurityPolicyFor(string css)
    {
        string hash = Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(css)));
        return $"default-src 'none'; img-src 'self'; style-src 'sha256-{hash}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
    }

    private static void AppendHeader(StringBuilder sb, SitePageModel m, string bookPath, bool canBook, string? phoneHref)
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
            sb.Append("<img class=\"logo\" src=\"").Append(E(logo)).Append("\" alt=\"Logo de ").Append(E(m.Name)).Append("\">\n");
        }
        sb.Append("<h1>").Append(E(m.Name)).Append("</h1>\n");
        if (!string.IsNullOrWhiteSpace(m.Tagline))
        {
            sb.Append("<p class=\"tagline\">").Append(E(m.Tagline)).Append("</p>\n");
        }
        sb.Append("<div class=\"actions\">\n");
        if (canBook)
        {
            sb.Append("<a class=\"btn\" href=\"").Append(E(bookPath)).Append("\">Réserver une table</a>\n");
        }
        if (m.Menus.Count > 0)
        {
            sb.Append("<a class=\"btn alt\" href=\"#carte\">Voir la carte</a>\n");
        }
        if (phoneHref is not null)
        {
            sb.Append("<a class=\"btn alt\" href=\"").Append(E(phoneHref)).Append("\">Appeler</a>\n");
        }
        sb.Append("</div>\n");
        if (!canBook)
        {
            sb.Append("<p class=\"note\">Pas de réservation en ligne : venez directement, la table est à vous dès qu’elle est libre.</p>\n");
        }
        sb.Append("</div>\n</header>\n");
    }

    private static void AppendNav(StringBuilder sb, SitePageModel m)
    {
        var links = new List<(string Href, string Label)>();
        if (m.Menus.Count > 0) links.Add(("#carte", "Carte"));
        links.Add(("#horaires", "Horaires"));
        if (m.Photos.Count > 0) links.Add(("#galerie", "Galerie"));
        links.Add(("#contact", "Contact"));

        sb.Append("<nav class=\"sections\" aria-label=\"Sections de la page\"><div class=\"wrap\"><ul>");
        foreach ((string href, string label) in links)
        {
            sb.Append("<li><a href=\"").Append(href).Append("\">").Append(label).Append("</a></li>");
        }
        sb.Append("</ul></div></nav>\n");
    }

    private static void AppendMenu(StringBuilder sb, SitePageModel m)
    {
        if (m.Menus.Count == 0)
        {
            return;
        }

        sb.Append("<section id=\"carte\" aria-labelledby=\"t-carte\"><div class=\"wrap\">\n<h2 id=\"t-carte\">La carte</h2>\n");
        sb.Append("<p class=\"lede\">Les allergènes sont indiqués sous chaque plat ; en cas de doute, demandez à l’équipe.</p>\n");
        foreach (PublicMenuView menu in m.Menus)
        {
            // One menu is "La carte" already; a heading only earns its place when it tells menus apart.
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
                    AppendDish(sb, item, menu.Currency);
                }
                sb.Append("</ul>\n");
            }
        }
        sb.Append("</div></section>\n");
    }

    private static void AppendDish(StringBuilder sb, PublicMenuItemView item, string currency)
    {
        sb.Append(item.SoldOut ? "<li class=\"dish off\">" : "<li class=\"dish\">");
        sb.Append("<span class=\"nm\">").Append(E(item.Name)).Append("</span>");
        sb.Append("<span class=\"pr\">")
            .Append(item.PriceMinor is { } price ? E(SiteFormat.Price(price, currency)) : "Prix sur demande")
            .Append("</span>");
        if (!string.IsNullOrWhiteSpace(item.Description))
        {
            sb.Append("<p class=\"ds\">").Append(E(item.Description)).Append("</p>");
        }

        IReadOnlyList<string> diets = SiteFormat.DietLabels(item.DietaryTags);
        IReadOnlyList<string> allergens = SiteFormat.AllergenLabels(item.Allergens);
        if (item.SoldOut || diets.Count > 0 || allergens.Count > 0)
        {
            sb.Append("<p class=\"meta\">");
            if (item.SoldOut) sb.Append("<span class=\"badge\">Épuisé</span>");
            foreach (string diet in diets) sb.Append("<span class=\"badge\">").Append(E(diet)).Append("</span>");
            if (allergens.Count > 0) sb.Append("Allergènes : ").Append(E(string.Join(", ", allergens)));
            sb.Append("</p>");
        }

        if (MediaPath(item.ImageUrl) is { } image)
        {
            sb.Append("<img src=\"").Append(E(image)).Append("\" alt=\"").Append(E(item.Name)).Append("\" width=\"96\" height=\"72\" loading=\"lazy\" decoding=\"async\">");
        }
        sb.Append("</li>\n");
    }

    private static void AppendHours(StringBuilder sb, SitePageModel m)
    {
        sb.Append("<section id=\"horaires\" aria-labelledby=\"t-horaires\"><div class=\"wrap\">\n<h2 id=\"t-horaires\">Horaires d’ouverture</h2>\n");
        sb.Append("<table class=\"hours\"><caption class=\"sr-only\">Horaires d’ouverture, du lundi au dimanche</caption><tbody>\n");
        foreach (SiteDayHours day in m.Hours)
        {
            sb.Append("<tr><th scope=\"row\">").Append(SiteFormat.DayName(day.IsoDay)).Append("</th><td>");
            sb.Append(day.Open is { } open && day.Close is { } close
                ? E(SiteFormat.TimeRange(open, close))
                : "<span class=\"closed\">Fermé</span>");
            sb.Append("</td></tr>\n");
        }
        sb.Append("</tbody></table>\n</div></section>\n");
    }

    private static void AppendGallery(StringBuilder sb, SitePageModel m)
    {
        List<SitePhoto> photos = m.Photos.Where(p => MediaPath(p.Url) is not null).ToList();
        if (photos.Count == 0)
        {
            return;
        }

        sb.Append("<section id=\"galerie\" aria-labelledby=\"t-galerie\"><div class=\"wrap\">\n<h2 id=\"t-galerie\">Galerie</h2>\n<ul class=\"gallery\">\n");
        foreach (SitePhoto photo in photos)
        {
            sb.Append("<li><img src=\"").Append(E(photo.Url)).Append("\" alt=\"").Append(E(photo.Alt))
                .Append("\" width=\"").Append(photo.Width).Append("\" height=\"").Append(photo.Height)
                .Append("\" loading=\"lazy\" decoding=\"async\"></li>\n");
        }
        sb.Append("</ul>\n</div></section>\n");
    }

    private static void AppendContact(StringBuilder sb, SitePageModel m, string bookPath, bool canBook, string? phoneHref)
    {
        sb.Append("<section id=\"contact\" aria-labelledby=\"t-contact\"><div class=\"wrap\">\n<h2 id=\"t-contact\">Nous trouver</h2>\n<div class=\"contact\">\n<div>\n");
        if (!string.IsNullOrWhiteSpace(m.Address))
        {
            sb.Append("<address>").Append(E(m.Address)).Append("</address>\n");
            sb.Append("<p><a href=\"").Append(E(SiteFormat.MapUrl(m.Address))).Append("\" target=\"_blank\" rel=\"noopener noreferrer\">Voir sur la carte<span class=\"sr-only\"> (s’ouvre dans un nouvel onglet)</span></a></p>\n");
        }
        if (phoneHref is not null)
        {
            sb.Append("<p>Téléphone : <a href=\"").Append(E(phoneHref)).Append("\">").Append(E(m.Phone)).Append("</a></p>\n");
        }
        if (!string.IsNullOrWhiteSpace(m.Email) && EmailValidator.IsValid(m.Email))
        {
            sb.Append("<p>E-mail : <a href=\"mailto:").Append(E(m.Email)).Append("\">").Append(E(m.Email)).Append("</a></p>\n");
        }
        sb.Append("</div>\n<div>\n");
        if (canBook)
        {
            sb.Append("<p><a class=\"btn\" href=\"").Append(E(bookPath)).Append("\">Réserver une table</a></p>\n");
        }
        List<SiteSocialLink> links = m.SocialLinks.Where(l => SiteFormat.IsSecureUrl(l.Url)).ToList();
        if (links.Count > 0)
        {
            sb.Append("<ul class=\"social\" aria-label=\"Réseaux sociaux\">\n");
            foreach (SiteSocialLink link in links)
            {
                sb.Append("<li><a href=\"").Append(E(link.Url)).Append("\" target=\"_blank\" rel=\"noopener noreferrer me\">")
                    .Append(E(link.Kind)).Append("<span class=\"sr-only\"> (s’ouvre dans un nouvel onglet)</span></a></li>\n");
            }
            sb.Append("</ul>\n");
        }
        sb.Append("</div>\n</div>\n</div></section>\n");
    }

    private static void AppendFooter(StringBuilder sb, SitePageModel m)
    {
        sb.Append("<footer><div class=\"wrap\">\n<h2 id=\"mentions-legales\">Mentions légales</h2>\n<dl>\n");
        Row(sb, "Établissement", m.Name);
        Row(sb, "Raison sociale", m.LegalName);
        Row(sb, "N° d’entreprise", m.CompanyNumber);
        Row(sb, "N° de TVA", m.VatNumber);
        Row(sb, "Siège", m.LegalAddress ?? m.Address);
        Row(sb, "Contact", m.Email ?? m.Phone);
        sb.Append("</dl>\n");
        sb.Append("<p>Ce site n’utilise aucun cookie et n’intègre aucun traceur ni service tiers : il ne collecte aucune donnée sur ses visiteurs.</p>\n");
        if (m.PrivacyPolicyUrl is { } privacy && UrlValidator.IsValid(privacy, UrlValidator.WebSchemes))
        {
            sb.Append("<p><a href=\"").Append(E(privacy)).Append("\" target=\"_blank\" rel=\"noopener noreferrer\">Politique de confidentialité<span class=\"sr-only\"> (s’ouvre dans un nouvel onglet)</span></a></p>\n");
        }
        sb.Append("</div></footer>\n");
    }

    private static void Row(StringBuilder sb, string label, string? value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            sb.Append("<dt>").Append(label).Append("</dt><dd>").Append(E(value)).Append("</dd>\n");
        }
    }

    private static string Description(SitePageModel m, bool canBook)
    {
        string lead = !string.IsNullOrWhiteSpace(m.Tagline)
            ? m.Tagline.Trim().TrimEnd('.') + "."
            : $"{m.Name}, restaurant.";
        string where = string.IsNullOrWhiteSpace(m.Address) ? "" : $" {m.Address.Trim().TrimEnd('.')}.";
        string tail = canBook ? " Carte, horaires et réservation en ligne." : " Carte, horaires et contact.";
        return SiteFormat.Truncate(lead + where + tail, 160);
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
