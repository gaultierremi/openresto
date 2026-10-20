using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Services;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Infrastructure.Auth;

namespace OpenRestoApi.Controllers;

/// <summary>
/// The platform's own space: the restaurants list, inviting a restaurateur, suspending, the one
/// audited door to a restaurant's guests. Owners only, and no API key at all: handing out a link
/// that creates an account, or reading guest data, is not something a key may do.
/// </summary>
[ApiController]
[Route("api/platform")]
[Authorize(Policy = AuthPolicies.RequirePlatform)]
[NoApiKeyAccess]
[EnableRateLimiting("auth")]
public class PlatformController(PlatformService platform) : ControllerBase
{
    private readonly PlatformService _platform = platform;

    [HttpGet("restaurants")]
    public async Task<ActionResult<List<PlatformRestaurantDto>>> GetRestaurants()
        => Ok(await _platform.GetRestaurantsAsync());

    [HttpPost("restaurants")]
    public async Task<ActionResult<PlatformInvitationResultDto>> CreateRestaurant([FromBody] CreatePlatformRestaurantRequest req)
        => Ok(await _platform.CreateRestaurantAsync(req));

    [HttpPost("restaurants/{restaurantId:int}/invitations")]
    public async Task<ActionResult<PlatformInvitationResultDto>> SendInvitation(int restaurantId, [FromBody] SendInvitationRequest req)
        => Ok(await _platform.SendInvitationAsync(restaurantId, req));

    [HttpPost("restaurants/{restaurantId:int}/suspend")]
    public async Task<ActionResult<PlatformRestaurantDto>> Suspend(int restaurantId, [FromBody] SuspendRestaurantRequest req)
        => Ok(await _platform.SuspendAsync(restaurantId, req));

    [HttpPost("restaurants/{restaurantId:int}/reactivate")]
    public async Task<ActionResult<PlatformRestaurantDto>> Reactivate(int restaurantId)
        => Ok(await _platform.ReactivateAsync(restaurantId));

    /// <summary>A POST although it reads: opening a restaurant's guests is an act that lands in the audit trail, with its reason.</summary>
    [HttpPost("restaurants/{restaurantId:int}/guest-data-access")]
    public async Task<ActionResult<GuestDataAccessDto>> AccessGuestData(int restaurantId, [FromBody] GuestDataAccessRequest req)
        => Ok(await _platform.AccessGuestDataAsync(restaurantId, req));

    [HttpGet("restaurants/{restaurantId:int}/consents")]
    public async Task<ActionResult<List<LegalAcceptanceDto>>> GetConsents(int restaurantId)
        => Ok(await _platform.GetAcceptancesAsync(restaurantId));
}
