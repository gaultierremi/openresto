using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Services;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Infrastructure.Auth;
using OpenRestoApi.Infrastructure.Auditing;

namespace OpenRestoApi.Controllers;

[ApiController]
[Route("api/onboarding/restaurants/{restaurantId:int}/operations")]
[Authorize(Policy = AuthPolicies.RequireRestaurateur)]
[NoApiKeyAccess]
public sealed class RestaurantOperationsController(RestaurantOperationsService operations) : ControllerBase
{
    [HttpGet]
    [ReadsGuestData("restaurateur-dashboard")]
    public async Task<ActionResult<RestaurantOperationsDto>> Get(int restaurantId)
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(await operations.GetAsync(restaurantId));
    }

    [HttpGet("export.csv")]
    [ReadsGuestData("restaurateur-export")]
    public async Task<IActionResult> Export(int restaurantId)
    {
        Response.Headers.CacheControl = "no-store";
        return File(Encoding.UTF8.GetBytes(await operations.ExportAsync(restaurantId)), "text/csv; charset=utf-8", "reservations-semaine.csv");
    }

    [HttpPut("exceptions")]
    public async Task<IActionResult> SaveException(int restaurantId, SaveServiceExceptionRequest request)
    {
        await operations.SaveExceptionAsync(restaurantId, request);
        return NoContent();
    }

    [HttpDelete("exceptions/{date}")]
    public async Task<IActionResult> RemoveException(int restaurantId, string date)
    {
        await operations.RemoveExceptionAsync(restaurantId, date);
        return NoContent();
    }

    [HttpPut("reminders")]
    public async Task<IActionResult> ReminderMode(int restaurantId, ReminderModeRequest request)
    {
        await operations.SetReminderModeAsync(restaurantId, request.Simulated);
        return NoContent();
    }

    [HttpPut("bookings/{bookingId:int}/status")]
    public async Task<IActionResult> Status(int restaurantId, int bookingId, BookingStatusRequest request)
    {
        await operations.SetStatusAsync(restaurantId, bookingId, request.Status);
        return NoContent();
    }

    [HttpGet("waitlist")]
    [ReadsGuestData("restaurateur-waitlist")]
    public async Task<ActionResult<WaitlistBoardDto>> Waitlist(int restaurantId)
    {
        Response.Headers.CacheControl = "no-store";
        return Ok(await operations.GetWaitlistAsync(restaurantId));
    }

    [HttpPost("waitlist")]
    public async Task<IActionResult> AddWaitlist(int restaurantId, JoinWaitlistRequest request)
    {
        await operations.AddWaitlistAsync(restaurantId, request);
        return NoContent();
    }

    [HttpPost("waitlist/{entryId:int}/{operation}")]
    public async Task<IActionResult> ActOnWaitlist(int restaurantId, int entryId, string operation)
    {
        await operations.ActOnWaitlistAsync(restaurantId, entryId, operation);
        return NoContent();
    }
}
