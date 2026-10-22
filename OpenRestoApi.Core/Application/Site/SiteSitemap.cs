using System.Globalization;
using System.Security;
using System.Text;

namespace OpenRestoApi.Core.Application.Site;

/// <summary>The two files that tell a crawler where the sites are: the sitemap and the robots file that names it.</summary>
public static class SiteSitemap
{
    /// <summary>One <c>url</c> per published site, with the date its content last changed.</summary>
    /// <seealso>SiteSitemapTests.Build_ListsEachPublishedSiteWithItsLastChange</seealso>
    public static string Build(string baseUrl, IEnumerable<(string Slug, DateTime UpdatedAtUtc)> sites, string? homePath = null)
    {
        var sb = new StringBuilder();
        sb.Append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
        if (homePath is not null)
            sb.Append("<url><loc>").Append(SecurityElement.Escape(SiteFormat.AbsoluteUrl(baseUrl, homePath))).Append("</loc></url>\n");
        if (homePath == "/")
            sb.Append("<url><loc>").Append(SecurityElement.Escape(SiteFormat.AbsoluteUrl(baseUrl, "/locations"))).Append("</loc></url>\n");
        foreach ((string slug, DateTime updated) in sites.OrderBy(s => s.Slug, StringComparer.Ordinal))
        {
            sb.Append("<url><loc>").Append(SecurityElement.Escape(SiteFormat.AbsoluteUrl(baseUrl, $"/r/{slug}")))
                .Append("</loc><lastmod>").Append(updated.ToUniversalTime().ToString("yyyy-MM-dd", CultureInfo.InvariantCulture))
                .Append("</lastmod></url>\n");
        }
        sb.Append("</urlset>\n");
        return sb.ToString();
    }

    /// <summary>
    /// Keeps crawlers out of the admin and the API and points them at the sitemap. It leaves the
    /// public menu pages alone on purpose: they say <c>noindex</c> themselves, and a crawler that
    /// is forbidden to fetch a page never sees that.
    /// </summary>
    public static string Robots(string baseUrl)
        => $"User-agent: *\nDisallow: /admin\nDisallow: /api/\n\nSitemap: {SiteFormat.AbsoluteUrl(baseUrl, "/sitemap.xml")}\n";
}
