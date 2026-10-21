using System.Xml.Linq;
using OpenRestoApi.Core.Application.Site;

namespace OpenRestoApi.Tests.Core;

public class SiteSitemapTests
{
    private static readonly XNamespace Ns = "http://www.sitemaps.org/schemas/sitemap/0.9";

    [Fact]
    public void Build_ListsEachPublishedSiteWithItsLastChange()
    {
        string xml = SiteSitemap.Build("https://resto.example.be/", new (string, DateTime)[]
        {
            ("zeta", new DateTime(2026, 10, 1, 8, 0, 0, DateTimeKind.Utc)),
            ("alpha", new DateTime(2026, 10, 20, 23, 30, 0, DateTimeKind.Utc)),
        });

        XDocument doc = XDocument.Parse(xml);
        XElement[] urls = doc.Root!.Elements(Ns + "url").ToArray();
        Assert.Equal(["https://resto.example.be/r/alpha", "https://resto.example.be/r/zeta"], urls.Select(u => u.Element(Ns + "loc")!.Value));
        Assert.Equal(["2026-10-20", "2026-10-01"], urls.Select(u => u.Element(Ns + "lastmod")!.Value));
    }

    [Fact]
    public void Build_WithNoSite_IsAnEmptyButValidSitemap()
    {
        XDocument doc = XDocument.Parse(SiteSitemap.Build("https://resto.example.be", []));

        Assert.Empty(doc.Root!.Elements());
    }

    [Fact]
    public void Build_EscapesAnAddressThatContainsMarkupCharacters()
    {
        XDocument doc = XDocument.Parse(SiteSitemap.Build("https://resto.example.be/?a=1&b=2", [("x", DateTime.UtcNow)]));

        Assert.Contains("a=1&b=2", doc.Root!.Element(Ns + "url")!.Element(Ns + "loc")!.Value, StringComparison.Ordinal);
    }

    [Fact]
    public void Robots_KeepsCrawlersOutOfTheAdminAndTheApi_AndNamesTheSitemap()
    {
        string robots = SiteSitemap.Robots("https://resto.example.be/");

        Assert.Contains("User-agent: *", robots, StringComparison.Ordinal);
        Assert.Contains("Disallow: /admin", robots, StringComparison.Ordinal);
        Assert.Contains("Disallow: /api/", robots, StringComparison.Ordinal);
        Assert.Contains("Sitemap: https://resto.example.be/sitemap.xml", robots, StringComparison.Ordinal);
    }

    [Fact]
    public void Robots_DoesNotForbidThePublicMenuPages_WhichSayNoindexThemselves()
        => Assert.DoesNotContain("/menu", SiteSitemap.Robots("https://resto.example.be"), StringComparison.Ordinal);
}
