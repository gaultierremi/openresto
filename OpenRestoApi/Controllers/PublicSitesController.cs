using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Application.Services;
using OpenRestoApi.Core.Application.Site;

namespace OpenRestoApi.Controllers;

/// <summary>
/// The restaurants' public websites, at <c>/r/{slug}</c> rather than under <c>/api</c>: they are
/// pages, not JSON, and a restaurant gives out their address. Anonymous and rate-limited. An
/// unknown slug, an unpublished site and an archived location all answer the same bare 404 page,
/// so the address cannot be used to find out which sites exist.
/// </summary>
[ApiController]
[AllowAnonymous]
[EnableRateLimiting("public")]
public class PublicSitesController(SiteService siteService) : ControllerBase
{
    private readonly SiteService _sites = siteService;

    private const string Html = "text/html; charset=utf-8";

    /// <summary>One minute: an unpublish, a sold-out dish or a new tagline shows up almost at once, while a busy page is not rebuilt per visitor.</summary>
    private const string PageCaching = "public, max-age=60";

    private const string VaryOnLanguage = "Accept-Language";

    /// <summary>
    /// The restaurant's public page, in French or Dutch: <c>?lang=fr|nl</c> first, then the browser's
    /// <c>Accept-Language</c>, then French.
    /// </summary>
    /// <seealso>SitesControllerTests.ThePublicPage_IsWrittenInTheLanguageTheVisitorAsksFor</seealso>
    /// <seealso>SitesControllerTests.ThePublicPage_VariesOnTheLanguageHeader_AndStaysCacheable</seealso>
    /// <seealso>SitesControllerTests.AnUnknownAddress_IsA404InTheVisitorsLanguage_ThatNamesNoSite</seealso>
    [HttpGet("/r/{slug}")]
    [HttpHead("/r/{slug}")]
    [Produces("text/html")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetSite(string slug, [FromQuery(Name = SiteLanguage.QueryKey)] string? lang)
    {
        string language = RequestLanguage(lang);
        Response.Headers.Vary = VaryOnLanguage;
        try
        {
            RenderedSitePage page = (await _sites.RenderPublishedAsync(slug)).In(language);
            Response.Headers.CacheControl = PageCaching;
            Response.Headers.ContentSecurityPolicy = page.ContentSecurityPolicy;
            Response.Headers.XContentTypeOptions = "nosniff";
            Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
            return Content(page.Html, Html);
        }
        catch (NotFoundException)
        {
            return NotFoundHtml(language);
        }
    }

    /// <summary>
    /// The booking button. A redirect rather than a link into the app, so the page itself never holds an internal id.
    /// <c>?lang=fr|nl</c> is passed on to the booking page; any other value is dropped.
    /// </summary>
    /// <seealso>SitesControllerTests.Reserve_ForwardsASupportedLanguageToTheBookingPage</seealso>
    /// <seealso>SitesControllerTests.Reserve_DropsAnyOtherLanguageValue_AndKeepsThePathTheServiceReturned</seealso>
    [HttpGet("/r/{slug}/reserver")]
    [HttpHead("/r/{slug}/reserver")]
    [ProducesResponseType(StatusCodes.Status302Found)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Reserve(string slug, [FromQuery(Name = SiteLanguage.QueryKey)] string? lang)
    {
        Response.Headers.Vary = VaryOnLanguage;
        try
        {
            return Redirect(SiteLanguage.WithLanguage(await _sites.GetBookingPathAsync(slug), lang));
        }
        catch (NotFoundException)
        {
            return NotFoundHtml(RequestLanguage(lang));
        }
    }

    [HttpGet("/sitemap.xml")]
    [HttpHead("/sitemap.xml")]
    [Produces("application/xml")]
    public async Task<IActionResult> Sitemap()
    {
        Response.Headers.CacheControl = PageCaching;
        return Content(await _sites.BuildSitemapAsync(), "application/xml; charset=utf-8");
    }

    [HttpGet("/robots.txt")]
    [HttpHead("/robots.txt")]
    [Produces("text/plain")]
    public async Task<IActionResult> Robots()
    {
        Response.Headers.CacheControl = PageCaching;
        return Content(await _sites.BuildRobotsAsync(), "text/plain; charset=utf-8");
    }

    private string RequestLanguage(string? queryLanguage)
        => SiteLanguage.Negotiate(queryLanguage, Request.Headers.AcceptLanguage.ToString());

    private static ContentResult NotFoundHtml(string language) => new()
    {
        StatusCode = StatusCodes.Status404NotFound,
        ContentType = Html,
        Content = SitePageRenderer.NotFoundPage(language),
    };
}
