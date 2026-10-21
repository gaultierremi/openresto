using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Services;
using OpenRestoApi.Infrastructure.Cookies;

namespace OpenRestoApi.Controllers;

/// <summary>
/// The two anonymous calls of the invitation link: what it is for, and accepting it. The token is
/// the only credential, so both sit on the <c>auth</c> rate-limit policy, and an unknown, used,
/// expired or revoked token all answer the same 404.
/// </summary>
[ApiController]
[Route("api/onboarding/invitations")]
[AllowAnonymous]
[EnableRateLimiting("auth")]
public class InvitationsController(OnboardingService onboarding, IAuthCookieService cookies) : ControllerBase
{
    private readonly OnboardingService _onboarding = onboarding;
    private readonly IAuthCookieService _cookies = cookies;

    [HttpGet("{token}")]
    public async Task<ActionResult<InvitationPreviewDto>> Get(string token)
        => Ok(await _onboarding.GetInvitationAsync(token));

    [HttpPost("{token}/accept")]
    public async Task<IActionResult> Accept(string token, [FromBody] AcceptInvitationRequest req)
    {
        AcceptedInvitation accepted = await _onboarding.AcceptInvitationAsync(token, req);
        _cookies.SetCookie(Response, accepted.Jwt);
        return Ok(new { restaurantId = accepted.RestaurantId });
    }
}
