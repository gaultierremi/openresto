using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Services;
using OpenRestoApi.Core.Application.Site;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Infrastructure.Auth;

namespace OpenRestoApi.Controllers;

/// <summary>
/// The admin side of a location's website ("Mon site"). Its own controller and scope
/// (<c>sites</c>), nested under the restaurant so a photo id from another location is a 404 by
/// construction. The guest side is <see cref="PublicSitesController"/>.
/// </summary>
[ApiController]
[Route("api/admin/restaurants/{restaurantId:int}/site")]
[Authorize(Policy = AuthPolicies.RequireAdmin)]
public class SitesController(SiteService siteService) : ControllerBase
{
    private readonly SiteService _sites = siteService;

    private static readonly string[] _allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];

    [HttpGet]
    [RequiresScope(ApiKeyScopes.Sites, ApiKeyScopes.Read)]
    public async Task<ActionResult<SiteDto>> GetSite(int restaurantId)
        => Ok(await _sites.GetAsync(restaurantId));

    [HttpPut]
    [RequiresScope(ApiKeyScopes.Sites, ApiKeyScopes.Write)]
    public async Task<ActionResult<SiteDto>> SaveSite(int restaurantId, [FromBody] SaveSiteRequest req)
        => Ok(await _sites.UpdateAsync(restaurantId, req));

    [HttpPost("publish")]
    [RequiresScope(ApiKeyScopes.Sites, ApiKeyScopes.Write)]
    public async Task<ActionResult<SiteDto>> Publish(int restaurantId)
        => Ok(await _sites.SetPublishedAsync(restaurantId, published: true));

    [HttpPost("unpublish")]
    [RequiresScope(ApiKeyScopes.Sites, ApiKeyScopes.Write)]
    public async Task<ActionResult<SiteDto>> Unpublish(int restaurantId)
        => Ok(await _sites.SetPublishedAsync(restaurantId, published: false));

    /// <summary>The page as it would render now, as HTML. <c>theme</c> previews another look without saving it.</summary>
    [HttpGet("preview")]
    [Produces("text/html")]
    [RequiresScope(ApiKeyScopes.Sites, ApiKeyScopes.Read)]
    public async Task<IActionResult> Preview(int restaurantId, [FromQuery] string? theme)
    {
        RenderedSitePage page = await _sites.PreviewAsync(restaurantId, theme);
        Response.Headers.CacheControl = "no-store";
        return Content(page.Html, "text/html; charset=utf-8");
    }

    // ── Pictures ─────────────────────────────────────────────────────────────

    [HttpPost("logo")]
    [RequiresScope(ApiKeyScopes.Sites, ApiKeyScopes.Write)]
    [RequestSizeLimit(SiteFields.MaxImageBytes + 8192)]
    public Task<ActionResult<SiteDto>> UploadLogo(int restaurantId, IFormFile file)
        => UploadImage(restaurantId, SiteImageKind.Logo, file);

    [HttpDelete("logo")]
    [RequiresScope(ApiKeyScopes.Sites, ApiKeyScopes.Write)]
    public async Task<ActionResult<SiteDto>> DeleteLogo(int restaurantId)
        => Ok(await _sites.DeleteImageAsync(restaurantId, SiteImageKind.Logo));

    [HttpPost("cover")]
    [RequiresScope(ApiKeyScopes.Sites, ApiKeyScopes.Write)]
    [RequestSizeLimit(SiteFields.MaxImageBytes + 8192)]
    public Task<ActionResult<SiteDto>> UploadCover(int restaurantId, IFormFile file)
        => UploadImage(restaurantId, SiteImageKind.Cover, file);

    [HttpDelete("cover")]
    [RequiresScope(ApiKeyScopes.Sites, ApiKeyScopes.Write)]
    public async Task<ActionResult<SiteDto>> DeleteCover(int restaurantId)
        => Ok(await _sites.DeleteImageAsync(restaurantId, SiteImageKind.Cover));

    /// <summary>Adds a gallery photo. <c>alt</c>, its text description, is required.</summary>
    [HttpPost("photos")]
    [RequiresScope(ApiKeyScopes.Sites, ApiKeyScopes.Write)]
    [RequestSizeLimit(SiteFields.MaxImageBytes + 8192)]
    public async Task<ActionResult<SiteDto>> AddPhoto(int restaurantId, IFormFile file, [FromForm] string? alt)
    {
        // The description is checked before the file is read, so a missing one costs no decoding.
        _ = SiteFields.NormalizeAlt(alt);
        if (await CheckImageAsync(file) is { } refusal)
        {
            return refusal;
        }

        await using Stream stream = file.OpenReadStream();
        return Ok(await _sites.AddPhotoAsync(restaurantId, alt, stream, file.ContentType));
    }

    [HttpPut("photos/{photoId}")]
    [RequiresScope(ApiKeyScopes.Sites, ApiKeyScopes.Write)]
    public async Task<ActionResult<SiteDto>> UpdatePhoto(int restaurantId, string photoId, [FromBody] SavePhotoAltRequest req)
        => Ok(await _sites.UpdatePhotoAltAsync(restaurantId, photoId, req.Alt));

    [HttpPatch("photos/reorder")]
    [RequiresScope(ApiKeyScopes.Sites, ApiKeyScopes.Write)]
    public async Task<ActionResult<SiteDto>> ReorderPhotos(int restaurantId, [FromBody] ReorderSitePhotosRequest req)
        => Ok(await _sites.ReorderPhotosAsync(restaurantId, req.Ids));

    [HttpDelete("photos/{photoId}")]
    [RequiresScope(ApiKeyScopes.Sites, ApiKeyScopes.Write)]
    public async Task<ActionResult<SiteDto>> DeletePhoto(int restaurantId, string photoId)
        => Ok(await _sites.DeletePhotoAsync(restaurantId, photoId));

    private async Task<ActionResult<SiteDto>> UploadImage(int restaurantId, SiteImageKind kind, IFormFile file)
    {
        if (await CheckImageAsync(file) is { } refusal)
        {
            return refusal;
        }

        await using Stream stream = file.OpenReadStream();
        return Ok(await _sites.SetImageAsync(restaurantId, kind, stream, file.ContentType));
    }

    /// <summary>
    /// The three checks every upload passes before it is decoded: a type the site accepts, a size
    /// under the cap, and leading bytes that really are that type — a <c>Content-Type</c> is only
    /// what the client wrote.
    /// </summary>
    private async Task<ActionResult?> CheckImageAsync(IFormFile file)
    {
        if (!_allowedImageTypes.Contains(file.ContentType))
        {
            return BadRequest(new MessageResponse { Message = "Only JPEG, PNG, and WebP images are accepted.", Code = ErrorCodes.MediaUnsupportedImageType });
        }

        if (file.Length > SiteFields.MaxImageBytes)
        {
            return BadRequest(new MessageResponse
            {
                Message = "The picture must be under 6 MB.",
                Code = ErrorCodes.SiteImageTooLarge,
            });
        }

        await using Stream stream = file.OpenReadStream();
        return await ImageSignature.MatchesAsync(stream, file.ContentType)
            ? null
            : BadRequest(new MessageResponse { Message = "Only JPEG, PNG, and WebP images are accepted.", Code = ErrorCodes.MediaUnsupportedImageType });
    }
}
