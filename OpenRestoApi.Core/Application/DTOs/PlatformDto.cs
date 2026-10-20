using System.ComponentModel.DataAnnotations;

namespace OpenRestoApi.Core.Application.DTOs;

// ── Platform space (/api/platform, Owner only) ───────────────────────────────
// Nothing here ever carries a guest's name, address or notes: the list is counts and dates.
// Guest data leaves only through GuestDataAccessDto, behind a stated reason.

public class PlatformRestaurantDto
{
    public int Id { get; set; }
    public string Name { get; set; } = null!;

    /// <summary><c>Draft</c>, <c>Published</c> or <c>Suspended</c>.</summary>
    public string Status { get; set; } = null!;

    public DateTime? PublishedAt { get; set; }
    public DateTime? SuspendedAt { get; set; }
    public string? SuspensionReason { get; set; }

    /// <summary>The restaurateur's sign-in address, once their account exists.</summary>
    public string? OwnerEmail { get; set; }

    /// <summary>The latest invitation sent for this restaurant; null when none was.</summary>
    public PlatformInvitationDto? Invitation { get; set; }

    /// <summary>The most recent sign-in of any account that runs the restaurant.</summary>
    public DateTime? LastLoginAt { get; set; }

    public int TotalBookings { get; set; }
    public int UpcomingBookings { get; set; }

    public int StepsDone { get; set; }
    public int StepsTotal { get; set; }

    /// <summary>The first setup step still to do (<c>info</c>, <c>hours</c>, …); null when all are settled.</summary>
    public string? NextStep { get; set; }
}

public class PlatformInvitationDto
{
    public string Email { get; set; } = null!;

    /// <summary><c>Pending</c>, <c>Accepted</c>, <c>Expired</c> or <c>Revoked</c>.</summary>
    public string State { get; set; } = null!;

    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
}

public class CreatePlatformRestaurantRequest
{
    [Required]
    [StringLength(100, MinimumLength = 1)]
    public string Name { get; set; } = null!;

    [Required]
    [StringLength(254)]
    public string OwnerEmail { get; set; } = null!;

    /// <summary>The language of the invitation mail: <c>fr</c>, <c>nl</c> or <c>en</c>. Missing means <c>fr</c>.</summary>
    [StringLength(8)]
    public string? Locale { get; set; }
}

public class SendInvitationRequest
{
    /// <summary>Another address to invite instead of the one on the previous invitation.</summary>
    [StringLength(254)]
    public string? Email { get; set; }

    [StringLength(8)]
    public string? Locale { get; set; }
}

/// <summary>
/// What an invitation call returns. <see cref="InvitationUrl"/> is shown once: only a hash of the
/// token is stored, so a link that was not copied now is a link that has to be re-sent.
/// </summary>
public class PlatformInvitationResultDto
{
    public PlatformRestaurantDto Restaurant { get; set; } = null!;
    public string InvitationUrl { get; set; } = null!;

    /// <summary>False when no mail went out (no SMTP configured, or it refused): the link has to be passed on by hand.</summary>
    public bool EmailSent { get; set; }
}

public class SuspendRestaurantRequest
{
    /// <summary>Shown to the restaurateur, so it states a fact and carries nothing internal.</summary>
    [StringLength(300)]
    public string? Reason { get; set; }
}

public class GuestDataAccessRequest
{
    /// <summary>
    /// Why the platform needs to read this restaurant's guests. Recorded in the audit trail.
    /// Bounded by the service rather than by model validation, so a refusal carries its code.
    /// </summary>
    public string? Reason { get; set; }
}

public class GuestDataAccessDto
{
    public int RestaurantId { get; set; }
    public string RestaurantName { get; set; } = null!;
    public DateTime GrantedAt { get; set; }

    /// <summary>All the restaurant's bookings; <see cref="Bookings"/> holds only the most recent ones.</summary>
    public int TotalBookings { get; set; }

    public List<PlatformGuestBookingDto> Bookings { get; set; } = [];
}

public class PlatformGuestBookingDto
{
    public string BookingRef { get; set; } = null!;
    public DateTime Date { get; set; }
    public int Seats { get; set; }
    public string? CustomerName { get; set; }
    public string? CustomerEmail { get; set; }
    public string? SpecialRequests { get; set; }
    public bool IsCancelled { get; set; }
    public bool IsAnonymized { get; set; }
}

public class LegalAcceptanceDto
{
    public string DocumentKey { get; set; } = null!;
    public string Version { get; set; } = null!;
    public string Email { get; set; } = null!;
    public string ContentSha256 { get; set; } = null!;
    public DateTime AcceptedAt { get; set; }
}
