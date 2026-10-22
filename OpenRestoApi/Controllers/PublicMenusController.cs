using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Services;

namespace OpenRestoApi.Controllers;

/// <summary>
/// What a guest's phone opens from a QR code. Anonymous, rate-limited, and reachable only by
/// public token. An unknown token, an archived location and a location with nothing published
/// all answer the same 404, so the endpoint cannot be used to tell which tokens exist.
/// </summary>
[ApiController]
[Route("api/menus")]
[AllowAnonymous]
[EnableRateLimiting("public")]
public class PublicMenusController(MenuService menuService) : ControllerBase
{
    private readonly MenuService _menus = menuService;

    [HttpPost("{kind}/{token}/views/{viewToken}")]
    public async Task<IActionResult> RecordView(string kind, string token, string viewToken)
    {
        await _menus.RecordDishViewAsync(kind, token, viewToken);
        return NoContent();
    }

    [HttpGet("r/{restaurantToken}")]
    public async Task<ActionResult<PublicMenuResponse>> GetByRestaurant(string restaurantToken)
        => Ok(await _menus.GetPublicMenuByRestaurantTokenAsync(restaurantToken));

    [HttpGet("t/{tableToken}")]
    public async Task<ActionResult<PublicMenuResponse>> GetByTable(string tableToken)
        => Ok(await _menus.GetPublicMenuByTableTokenAsync(tableToken));
}
