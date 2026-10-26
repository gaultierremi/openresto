using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Services;
using OpenRestoApi.Core.Application.Site;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Infrastructure.Auth;
using OpenRestoApi.Infrastructure.Auditing;
using OpenRestoApi.Extensions;

namespace OpenRestoApi.Controllers;

/// <summary>
/// A restaurateur's own space: the setup assistant for the restaurants they run. Gated by
/// <see cref="AuthPolicies.RequireRestaurateur"/>, which no admin satisfies and no restaurateur
/// satisfies for the admin endpoints. Every route names the restaurant, and the service answers a
/// restaurant the caller does not run exactly as it answers one that does not exist.
/// </summary>
[ApiController]
[Route("api/onboarding")]
[Authorize(Policy = AuthPolicies.RequireRestaurateur)]
[NoApiKeyAccess]
public class OnboardingController(OnboardingService onboarding) : ControllerBase
{
    private readonly OnboardingService _onboarding = onboarding;

    private static readonly string[] _allowedImageTypes = ["image/jpeg", "image/png", "image/webp"];

    [HttpGet("me")]
    public async Task<ActionResult<OnboardingMeDto>> Me()
        => Ok(await _onboarding.GetMeAsync());

    [HttpGet("restaurants/{restaurantId:int}")]
    public async Task<ActionResult<OnboardingStateDto>> GetState(int restaurantId)
        => Ok(await _onboarding.GetStateAsync(restaurantId));

    [HttpGet("restaurants/{restaurantId:int}/inbox")]
    [ReadsGuestData("restaurant-inbox")]
    public async Task<ActionResult<RestaurantInboxDto>> Inbox(int restaurantId)
    {
        RestaurantInboxDto inbox = await _onboarding.GetInboxAsync(restaurantId);
        Response.Headers.CacheControl = "no-store";
        this.NoteGuestDataLocation(restaurantId);
        return Ok(inbox);
    }

    [HttpPost("restaurants/{restaurantId:int}/menu/import")]
    [RequestSizeLimit(100000)]
    public async Task<ActionResult<SaveOnboardingMenuRequest>> ImportMenu(int restaurantId, MenuImportRequest request)
        => Ok(await _onboarding.ImportMenuAsync(restaurantId, request.Text, request.Language));

    [HttpPost("restaurants/{restaurantId:int}/menu/import/photo")]
    [EnableRateLimiting("auth")]
    [RequestSizeLimit(SiteFields.MaxImageBytes + 8192)]
    public async Task<ActionResult<SaveOnboardingMenuRequest>> ImportPhoto(int restaurantId, IFormFile file,
        [FromForm] string language, [FromServices] IMenuPhotoReader reader)
    {
        await _onboarding.CheckMenuImportAsync(restaurantId);
        if (await CheckImageAsync(file) is { } refusal) return refusal;
        await using var copy = new MemoryStream();
        await file.CopyToAsync(copy, HttpContext.RequestAborted);
        copy.Position = 0;
        string text = await reader.ReadAsync(copy, file.ContentType, language, HttpContext.RequestAborted);
        return Ok(await _onboarding.ImportMenuAsync(restaurantId, text, language));
    }

    [HttpPut("restaurants/{restaurantId:int}/info")]
    public async Task<ActionResult<OnboardingStateDto>> SaveInfo(int restaurantId, [FromBody] SaveOnboardingInfoRequest req)
        => Ok(await _onboarding.SaveInfoAsync(restaurantId, req));

    [HttpPut("restaurants/{restaurantId:int}/hours")]
    public async Task<ActionResult<OnboardingStateDto>> SaveHours(int restaurantId, [FromBody] SaveOnboardingHoursRequest req)
        => Ok(await _onboarding.SaveHoursAsync(restaurantId, req));

    [HttpPut("restaurants/{restaurantId:int}/layout")]
    public async Task<ActionResult<OnboardingStateDto>> SaveLayout(int restaurantId, [FromBody] SaveOnboardingLayoutRequest req)
        => Ok(await _onboarding.SaveLayoutAsync(restaurantId, req));

    [HttpPut("restaurants/{restaurantId:int}/menu")]
    public async Task<ActionResult<OnboardingStateDto>> SaveMenu(int restaurantId, [FromBody] SaveOnboardingMenuRequest req)
        => Ok(await _onboarding.SaveMenuAsync(restaurantId, req));

    [HttpPut("restaurants/{restaurantId:int}/branding")]
    public async Task<ActionResult<OnboardingStateDto>> SaveBranding(int restaurantId, [FromBody] SaveOnboardingBrandingRequest req)
        => Ok(await _onboarding.SaveBrandingAsync(restaurantId, req));

    [HttpGet("restaurants/{restaurantId:int}/menu/tokens")]
    public async Task<ActionResult<MenuPublicTokensDto>> MenuTokens(int restaurantId)
        => Ok(await _onboarding.GetMenuTokensAsync(restaurantId));

    [HttpPut("restaurants/{restaurantId:int}/menu/items/{itemId:int}/availability")]
    public async Task<ActionResult<MenuItemDto>> SetMenuAvailability(int restaurantId, int itemId, SetMenuAvailabilityRequest req)
        => Ok(await _onboarding.SetMenuAvailabilityAsync(restaurantId, itemId, req.Availability));

    [HttpPost("restaurants/{restaurantId:int}/menu/items/{itemId:int}/photo")]
    [RequestSizeLimit(2 * 1024 * 1024 + 8192)]
    public async Task<ActionResult<MenuItemDto>> UploadMenuPhoto(int restaurantId, int itemId, IFormFile file)
    {
        await using Stream stream = file.OpenReadStream();
        return Ok(await _onboarding.SetMenuPhotoAsync(restaurantId, itemId, stream, file.ContentType));
    }

    [HttpDelete("restaurants/{restaurantId:int}/menu/items/{itemId:int}/photo")]
    public async Task<ActionResult<MenuItemDto>> DeleteMenuPhoto(int restaurantId, int itemId)
        => Ok(await _onboarding.DeleteMenuPhotoAsync(restaurantId, itemId));

    [HttpPost("restaurants/{restaurantId:int}/logo")]
    [RequestSizeLimit(SiteFields.MaxImageBytes + 8192)]
    public async Task<ActionResult<OnboardingStateDto>> UploadLogo(int restaurantId, IFormFile file)
    {
        if (await CheckImageAsync(file) is { } refusal)
        {
            return refusal;
        }

        await using Stream stream = file.OpenReadStream();
        return Ok(await _onboarding.SetLogoAsync(restaurantId, stream, file.ContentType));
    }

    [HttpDelete("restaurants/{restaurantId:int}/logo")]
    public async Task<ActionResult<OnboardingStateDto>> DeleteLogo(int restaurantId)
        => Ok(await _onboarding.DeleteLogoAsync(restaurantId));

    [HttpPost("restaurants/{restaurantId:int}/steps/{step}/skip")]
    public async Task<ActionResult<OnboardingStateDto>> SkipStep(int restaurantId, string step)
        => Ok(await _onboarding.SkipStepAsync(restaurantId, step));

    [HttpGet("restaurants/{restaurantId:int}/preview")]
    public async Task<ActionResult<OnboardingPreviewDto>> GetPreview(int restaurantId)
        => Ok(await _onboarding.GetPreviewAsync(restaurantId));

    /// <summary>The website as it renders now, as HTML for the frame in step 5.</summary>
    [HttpGet("restaurants/{restaurantId:int}/preview/site")]
    [Produces("text/html")]
    public async Task<IActionResult> PreviewSite(int restaurantId, [FromQuery] string? theme)
    {
        RenderedSitePage page = await _onboarding.PreviewSiteAsync(restaurantId, theme);
        Response.Headers.CacheControl = "no-store";
        return Content(page.Html, "text/html; charset=utf-8");
    }

    [HttpPost("restaurants/{restaurantId:int}/publish")]
    public async Task<ActionResult<OnboardingStateDto>> Publish(int restaurantId)
        => Ok(await _onboarding.PublishAsync(restaurantId));

    [HttpPost("restaurants/{restaurantId:int}/unpublish")]
    public async Task<ActionResult<OnboardingStateDto>> Unpublish(int restaurantId)
        => Ok(await _onboarding.UnpublishAsync(restaurantId));

    /// <summary>A type the site accepts, a size under the cap, and leading bytes that really are that type.</summary>
    private async Task<ActionResult?> CheckImageAsync(IFormFile file)
    {
        if (!_allowedImageTypes.Contains(file.ContentType))
        {
            return BadRequest(new MessageResponse { Message = "Only JPEG, PNG, and WebP images are accepted.", Code = ErrorCodes.MediaUnsupportedImageType });
        }

        if (file.Length > SiteFields.MaxImageBytes)
        {
            return BadRequest(new MessageResponse { Message = "The picture must be under 6 MB.", Code = ErrorCodes.SiteImageTooLarge });
        }

        await using Stream stream = file.OpenReadStream();
        return await ImageSignature.MatchesAsync(stream, file.ContentType)
            ? null
            : BadRequest(new MessageResponse { Message = "Only JPEG, PNG, and WebP images are accepted.", Code = ErrorCodes.MediaUnsupportedImageType });
    }
}
