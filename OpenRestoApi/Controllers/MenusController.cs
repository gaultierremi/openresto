using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Services;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Infrastructure.Auth;

namespace OpenRestoApi.Controllers;

/// <summary>
/// The admin side of the menu module. Its own controller rather than more of
/// <c>AdminController</c>: it answers to its own scope (<c>menus</c>), and every route nests under
/// the restaurant, so a category or item id from another restaurant is a 404 by construction.
/// The guest side is <see cref="PublicMenusController"/>.
/// </summary>
[ApiController]
[Route("api/admin/restaurants/{restaurantId:int}")]
[Authorize(Policy = AuthPolicies.RequireAdmin)]
public class MenusController(MenuService menuService) : ControllerBase
{
    private readonly MenuService _menus = menuService;

    private static readonly string[] _allowedPhotoTypes = ["image/jpeg", "image/png", "image/webp"];
    private const long _maxPhotoBytes = 2 * 1024 * 1024;

    // ── Menus ────────────────────────────────────────────────────────────────

    [HttpGet("menus")]
    [RequiresScope(ApiKeyScopes.Menus, ApiKeyScopes.Read)]
    public async Task<ActionResult<List<MenuDto>>> GetMenus(int restaurantId)
        => Ok(await _menus.GetMenusAsync(restaurantId));

    [HttpGet("menus/{menuId:int}")]
    [RequiresScope(ApiKeyScopes.Menus, ApiKeyScopes.Read)]
    public async Task<ActionResult<MenuDto>> GetMenu(int restaurantId, int menuId)
        => Ok(await _menus.GetMenuAsync(restaurantId, menuId));

    [HttpPost("menus")]
    [RequiresScope(ApiKeyScopes.Menus, ApiKeyScopes.Write)]
    public async Task<ActionResult<MenuDto>> CreateMenu(int restaurantId, [FromBody] SaveMenuRequest req)
    {
        MenuDto menu = await _menus.CreateMenuAsync(restaurantId, req);
        return CreatedAtAction(nameof(GetMenu), new { restaurantId, menuId = menu.Id }, menu);
    }

    [HttpPut("menus/{menuId:int}")]
    [RequiresScope(ApiKeyScopes.Menus, ApiKeyScopes.Write)]
    public async Task<ActionResult<MenuDto>> UpdateMenu(int restaurantId, int menuId, [FromBody] SaveMenuRequest req)
        => Ok(await _menus.UpdateMenuAsync(restaurantId, menuId, req));

    [HttpDelete("menus/{menuId:int}")]
    [RequiresScope(ApiKeyScopes.Menus, ApiKeyScopes.Write)]
    public async Task<IActionResult> DeleteMenu(int restaurantId, int menuId)
    {
        await _menus.DeleteMenuAsync(restaurantId, menuId);
        return NoContent();
    }

    [HttpPost("menus/{menuId:int}/publish")]
    [RequiresScope(ApiKeyScopes.Menus, ApiKeyScopes.Write)]
    public async Task<ActionResult<MenuDto>> PublishMenu(int restaurantId, int menuId)
        => Ok(await _menus.SetPublishedAsync(restaurantId, menuId, published: true));

    [HttpPost("menus/{menuId:int}/unpublish")]
    [RequiresScope(ApiKeyScopes.Menus, ApiKeyScopes.Write)]
    public async Task<ActionResult<MenuDto>> UnpublishMenu(int restaurantId, int menuId)
        => Ok(await _menus.SetPublishedAsync(restaurantId, menuId, published: false));

    [HttpPatch("menus/reorder")]
    [RequiresScope(ApiKeyScopes.Menus, ApiKeyScopes.Write)]
    public async Task<IActionResult> ReorderMenus(int restaurantId, [FromBody] ReorderMenuEntriesRequest req)
    {
        await _menus.ReorderMenusAsync(restaurantId, req.Ids);
        return NoContent();
    }

    // ── Categories ───────────────────────────────────────────────────────────

    [HttpPost("menus/{menuId:int}/categories")]
    [RequiresScope(ApiKeyScopes.Menus, ApiKeyScopes.Write)]
    public async Task<ActionResult<MenuCategoryDto>> CreateCategory(int restaurantId, int menuId, [FromBody] SaveMenuCategoryRequest req)
    {
        MenuCategoryDto category = await _menus.CreateCategoryAsync(restaurantId, menuId, req);
        return CreatedAtAction(nameof(GetMenu), new { restaurantId, menuId }, category);
    }

    [HttpPatch("menus/{menuId:int}/categories/reorder")]
    [RequiresScope(ApiKeyScopes.Menus, ApiKeyScopes.Write)]
    public async Task<IActionResult> ReorderCategories(int restaurantId, int menuId, [FromBody] ReorderMenuEntriesRequest req)
    {
        await _menus.ReorderCategoriesAsync(restaurantId, menuId, req.Ids);
        return NoContent();
    }

    [HttpPut("menu-categories/{categoryId:int}")]
    [RequiresScope(ApiKeyScopes.Menus, ApiKeyScopes.Write)]
    public async Task<ActionResult<MenuCategoryDto>> UpdateCategory(int restaurantId, int categoryId, [FromBody] SaveMenuCategoryRequest req)
        => Ok(await _menus.UpdateCategoryAsync(restaurantId, categoryId, req));

    [HttpDelete("menu-categories/{categoryId:int}")]
    [RequiresScope(ApiKeyScopes.Menus, ApiKeyScopes.Write)]
    public async Task<IActionResult> DeleteCategory(int restaurantId, int categoryId)
    {
        await _menus.DeleteCategoryAsync(restaurantId, categoryId);
        return NoContent();
    }

    // ── Items ────────────────────────────────────────────────────────────────

    [HttpPost("menu-categories/{categoryId:int}/items")]
    [RequiresScope(ApiKeyScopes.Menus, ApiKeyScopes.Write)]
    public async Task<ActionResult<MenuItemDto>> CreateItem(int restaurantId, int categoryId, [FromBody] SaveMenuItemRequest req)
    {
        MenuItemDto item = await _menus.CreateItemAsync(restaurantId, categoryId, req);
        return StatusCode(StatusCodes.Status201Created, item);
    }

    [HttpPatch("menu-categories/{categoryId:int}/items/reorder")]
    [RequiresScope(ApiKeyScopes.Menus, ApiKeyScopes.Write)]
    public async Task<IActionResult> ReorderItems(int restaurantId, int categoryId, [FromBody] ReorderMenuEntriesRequest req)
    {
        await _menus.ReorderItemsAsync(restaurantId, categoryId, req.Ids);
        return NoContent();
    }

    [HttpPut("menu-items/{itemId:int}")]
    [RequiresScope(ApiKeyScopes.Menus, ApiKeyScopes.Write)]
    public async Task<ActionResult<MenuItemDto>> UpdateItem(int restaurantId, int itemId, [FromBody] SaveMenuItemRequest req)
        => Ok(await _menus.UpdateItemAsync(restaurantId, itemId, req));

    [HttpDelete("menu-items/{itemId:int}")]
    [RequiresScope(ApiKeyScopes.Menus, ApiKeyScopes.Write)]
    public async Task<IActionResult> DeleteItem(int restaurantId, int itemId)
    {
        await _menus.DeleteItemAsync(restaurantId, itemId);
        return NoContent();
    }

    [HttpPost("menu-items/{itemId:int}/photo")]
    [RequiresScope(ApiKeyScopes.Menus, ApiKeyScopes.Write)]
    [RequestSizeLimit(_maxPhotoBytes + 8192)]
    public async Task<ActionResult<MenuItemDto>> UploadItemPhoto(int restaurantId, int itemId, IFormFile file)
    {
        if (!_allowedPhotoTypes.Contains(file.ContentType))
            return BadRequest(new MessageResponse { Message = "Only JPEG, PNG, and WebP images are accepted.", Code = ErrorCodes.MediaUnsupportedImageType });

        if (file.Length > _maxPhotoBytes)
            return BadRequest(new MessageResponse { Message = "Dish photo must be under 2 MB.", Code = ErrorCodes.MenuItemImageTooLarge });

        await using Stream stream = file.OpenReadStream();
        return Ok(await _menus.UploadItemPhotoAsync(restaurantId, itemId, stream, file.ContentType));
    }

    [HttpDelete("menu-items/{itemId:int}/photo")]
    [RequiresScope(ApiKeyScopes.Menus, ApiKeyScopes.Write)]
    public async Task<IActionResult> DeleteItemPhoto(int restaurantId, int itemId)
    {
        await _menus.DeleteItemPhotoAsync(restaurantId, itemId);
        return NoContent();
    }

    // ── Public tokens ────────────────────────────────────────────────────────

    [HttpGet("public-tokens")]
    [RequiresScope(ApiKeyScopes.Menus, ApiKeyScopes.Read)]
    public async Task<ActionResult<MenuPublicTokensDto>> GetPublicTokens(int restaurantId)
        => Ok(await _menus.GetPublicTokensAsync(restaurantId));

    [HttpPost("public-token/regenerate")]
    [Authorize(Policy = AuthPolicies.RequireOwner)]
    [RequiresScope(ApiKeyScopes.Menus, ApiKeyScopes.Write)]
    public async Task<ActionResult<RegeneratedTokenDto>> RegenerateRestaurantToken(int restaurantId)
        => Ok(await _menus.RegenerateRestaurantTokenAsync(restaurantId));

    [HttpPost("tables/{tableId:int}/public-token/regenerate")]
    [Authorize(Policy = AuthPolicies.RequireOwner)]
    [RequiresScope(ApiKeyScopes.Menus, ApiKeyScopes.Write)]
    public async Task<ActionResult<RegeneratedTokenDto>> RegenerateTableToken(int restaurantId, int tableId)
        => Ok(await _menus.RegenerateTableTokenAsync(restaurantId, tableId));
}
