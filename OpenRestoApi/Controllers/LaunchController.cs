using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Application.Launch;
using OpenRestoApi.Core.Application.Legal;
using OpenRestoApi.Core.Application.Services;

namespace OpenRestoApi.Controllers;

[AllowAnonymous]
[ApiExplorerSettings(IgnoreApi = true)]
[EnableRateLimiting("public")]
public class LaunchController(
    BrandService brand,
    IAntiforgery antiforgery,
    PublicRegistrationService registration) : Controller
{
    private bool Enabled => brand.PublicLaunchEnabled;
    private string HomePath => Enabled ? "/" : "/decouvrir";
    private async Task<string> BaseUrlAsync() => brand.GetWebsiteUrl(await brand.GetAsync()).TrimEnd('/');

    [HttpGet("/")]
    [HttpHead("/")]
    public async Task<IActionResult> Home()
        => Enabled ? Render(LaunchPageRenderer.Home(await BaseUrlAsync(), HomePath)) : NotFound();

    [HttpGet("/decouvrir")]
    [HttpHead("/decouvrir")]
    public async Task<IActionResult> Discover()
        => Enabled ? Redirect("/") : Render(LaunchPageRenderer.Home(await BaseUrlAsync(), HomePath));

    [HttpGet("/inscription")]
    public async Task<IActionResult> Register()
        => Render(LaunchPageRenderer.Registration(await BaseUrlAsync(), HomePath,
            Enabled ? antiforgery.GetAndStoreTokens(HttpContext).RequestToken! : "", enabled: Enabled), sensitive: true);

    [HttpPost("/inscription")]
    [EnableRateLimiting("auth")]
    [RequestSizeLimit(4096)]
    public async Task<IActionResult> RequestLink([FromForm] string? name, [FromForm] string? email, [FromForm] string? website)
    {
        if (!Enabled) return NotFound();
        string? error;
        int status;
        if (!await antiforgery.IsRequestValidAsync(HttpContext))
        {
            error = "Le formulaire a expiré. Réessayez depuis cette page.";
            status = StatusCodes.Status400BadRequest;
        }
        else
        {
            try
            {
                if (await registration.RequestAsync(name, email, website) == RegistrationOutcome.Sent)
                {
                    Response.Headers.CacheControl = "no-store";
                    Response.Headers.Location = "/inscription/envoyee";
                    return StatusCode(StatusCodes.Status303SeeOther);
                }
                error = "L’envoi du lien est momentanément indisponible. Réessayez un peu plus tard.";
                status = StatusCodes.Status503ServiceUnavailable;
            }
            catch (ValidationException)
            {
                error = "Indiquez un nom de restaurant de 1 à 100 caractères et une adresse e-mail valide.";
                status = StatusCodes.Status400BadRequest;
            }
        }
        return Render(LaunchPageRenderer.Registration(await BaseUrlAsync(), HomePath,
            antiforgery.GetAndStoreTokens(HttpContext).RequestToken!, error), status, sensitive: true);
    }

    [HttpGet("/inscription/envoyee")]
    public async Task<IActionResult> Sent()
        => Render(LaunchPageRenderer.Sent(await BaseUrlAsync(), HomePath), sensitive: true);

    [HttpGet("/legal")]
    [HttpHead("/legal")]
    public async Task<IActionResult> LegalIndex()
        => Render(LaunchPageRenderer.LegalIndex(await BaseUrlAsync(), HomePath));

    [HttpGet("/legal/{key}")]
    [HttpHead("/legal/{key}")]
    public async Task<IActionResult> Legal(string key)
    {
        LegalDocument? document = LegalCatalog.Find(key);
        return Render(LaunchPageRenderer.Legal(await BaseUrlAsync(), HomePath, document),
            document is null ? StatusCodes.Status404NotFound : StatusCodes.Status200OK);
    }

    private ContentResult Render(LaunchPage page, int status = StatusCodes.Status200OK, bool sensitive = false)
    {
        Response.Headers.ContentSecurityPolicy = page.ContentSecurityPolicy;
        Response.Headers.CacheControl = sensitive ? "no-store" : "public, max-age=60";
        Response.Headers.XContentTypeOptions = "nosniff";
        Response.Headers["Referrer-Policy"] = "no-referrer";
        if (sensitive) Response.Headers["X-Robots-Tag"] = "noindex, nofollow";
        return new ContentResult { Content = page.Html, ContentType = "text/html; charset=utf-8", StatusCode = status };
    }
}
