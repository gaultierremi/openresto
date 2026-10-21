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

    private const string NotFoundPage =
        "<!doctype html><html lang=\"fr\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        + "<meta name=\"robots\" content=\"noindex\"><title>Page introuvable</title></head>"
        + "<body style=\"font:1.1rem/1.6 system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem\">"
        + "<h1>Page introuvable</h1><p>Cette adresse ne correspond à aucun site.</p></body></html>";

    [HttpGet("/r/{slug}")]
    [HttpHead("/r/{slug}")]
    [Produces("text/html")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetSite(string slug)
    {
        try
        {
            RenderedSitePage page = await _sites.RenderPublishedAsync(slug);
            Response.Headers.CacheControl = PageCaching;
            Response.Headers.ContentSecurityPolicy = page.ContentSecurityPolicy;
            Response.Headers.XContentTypeOptions = "nosniff";
            Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
            return Content(page.Html, Html);
        }
        catch (NotFoundException)
        {
            return NotFoundHtml();
        }
    }

    /// <summary>The booking button. A redirect rather than a link into the app, so the page itself never holds an internal id.</summary>
    [HttpGet("/r/{slug}/reserver")]
    [HttpHead("/r/{slug}/reserver")]
    [ProducesResponseType(StatusCodes.Status302Found)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Reserve(string slug)
    {
        try
        {
            return Redirect(await _sites.GetBookingPathAsync(slug));
        }
        catch (NotFoundException)
        {
            return NotFoundHtml();
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

    private ContentResult NotFoundHtml() => new()
    {
        StatusCode = StatusCodes.Status404NotFound,
        ContentType = Html,
        Content = NotFoundPage,
    };
}
