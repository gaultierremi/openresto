using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Launch;
using OpenRestoApi.Core.Application.Services;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Controllers;

[AllowAnonymous]
[ApiExplorerSettings(IgnoreApi = true)]
[EnableRateLimiting("public")]
public class PublicGuestsController(
    RestaurantManagementService restaurants,
    IAvailabilityService availability,
    ISiteRepository sites,
    BrandService brand,
    MenuService menus,
    ISystemClock clock) : Controller
{
    [HttpGet("/locations")]
    [HttpHead("/locations")]
    public async Task<IActionResult> Locations()
    {
        if (!brand.PublicLaunchEnabled) return Legacy();
        var published = (await sites.GetPublishedAsync()).ToDictionary(s => s.RestaurantId, s => s.Slug);
        return Render(GuestPageRenderer.Locations(await brand.GetWebsiteUrlAsync(), await restaurants.GetAllAsync(), published));
    }

    [HttpGet("/locations/{id:int}")]
    [HttpHead("/locations/{id:int}")]
    public async Task<IActionResult> Restaurant(int id, [FromQuery] string? date, [FromQuery] int seats = 2)
    {
        if (!brand.PublicLaunchEnabled) return Legacy();
        RestaurantDto? restaurant = await restaurants.GetByIdAsync(id);
        if (restaurant is null)
        {
            ContentResult missing = Render(LaunchPageRenderer.Page("Restaurant introuvable | OpenResto", "Cet établissement n’est pas disponible.",
                await brand.GetWebsiteUrlAsync(), "/locations", "<h1>Restaurant introuvable</h1><p><a href=\"/locations\">Voir les restaurants disponibles</a></p>", "/", noIndex: true));
            missing.StatusCode = StatusCodes.Status404NotFound;
            return missing;
        }
        TimeZoneInfo timezone = TimeZoneHelper.Resolve(restaurant.Timezone);
        DateTime today = TimeZoneInfo.ConvertTimeFromUtc(clock.UtcNow, timezone).Date;
        DateTime day = DateTime.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out DateTime parsed) ? parsed : today;
        if ((date is not null && !DateTime.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _))
            || day < today || day > today.AddDays(GuestBookingTimes.MaximumAdvanceDays) || seats is < BookingLimits.MinSeats or > BookingLimits.MaxSeats)
            return BadRequest("La date doit être comprise dans les 90 prochains jours et le nombre de couverts entre 1 et 50.");
        AvailabilityResponseDto response = await availability.GetAvailabilityAsync(id, day, seats);
        List<GuestSlot> slots = GuestBookingTimes.Slots(response, day, restaurant.Timezone, clock.UtcNow);
        string? slug = (await sites.GetPublishedAsync()).FirstOrDefault(s => s.RestaurantId == id)?.Slug;
        return Render(GuestPageRenderer.Restaurant(await brand.GetWebsiteUrlAsync(), restaurant,
            day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), seats,
            today.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), today.AddDays(GuestBookingTimes.MaximumAdvanceDays).ToString("yyyy-MM-dd", CultureInfo.InvariantCulture), slots, slug));
    }

    [HttpGet("/lookup")]
    [HttpHead("/lookup")]
    [HttpGet("/booking-confirmation/{reference}")]
    [HttpHead("/booking-confirmation/{reference}")]
    public async Task<IActionResult> Lookup(string? reference)
    {
        if (!brand.PublicLaunchEnabled) return Legacy();
        return Render(GuestPageRenderer.Lookup(await brand.GetWebsiteUrlAsync(), reference), sensitive: true);
    }

    [HttpGet("/menu/{kind:regex(^(r|t)$)}/{token}")]
    [HttpHead("/menu/{kind:regex(^(r|t)$)}/{token}")]
    public async Task<IActionResult> Menu(string kind, string token)
    {
        if (!brand.PublicLaunchEnabled) return Legacy();
        try
        {
            PublicMenuResponse menu = kind == "r"
                ? await menus.GetPublicMenuByRestaurantTokenAsync(token)
                : await menus.GetPublicMenuByTableTokenAsync(token);
            return Render(GuestPageRenderer.Menu(await brand.GetWebsiteUrlAsync(), menu, $"/menu/{kind}/{token}"), sensitive: true);
        }
        catch (NotFoundException)
        {
            ContentResult page = Render(LaunchPageRenderer.Page("Carte indisponible | OpenResto", "Cette carte n’est pas disponible.",
                await brand.GetWebsiteUrlAsync(), "/locations", "<h1>Carte indisponible</h1><p>Contactez le restaurant pour consulter sa carte.</p>", "/", noIndex: true), sensitive: true);
            page.StatusCode = StatusCodes.Status404NotFound;
            return page;
        }
    }

    private ContentResult Render(LaunchPage page, bool sensitive = false)
    {
        Response.Headers.ContentSecurityPolicy = page.ContentSecurityPolicy;
        Response.Headers.CacheControl = "no-store";
        Response.Headers.XContentTypeOptions = "nosniff";
        Response.Headers["Referrer-Policy"] = "no-referrer";
        if (sensitive) Response.Headers["X-Robots-Tag"] = "noindex, nofollow";
        return Content(page.Html, "text/html; charset=utf-8");
    }

    private NotFoundResult Legacy()
    {
        Response.Headers["X-OpenResto-Legacy"] = "true";
        return NotFound();
    }
}
