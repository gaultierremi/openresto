using System.ComponentModel.DataAnnotations;

namespace OpenRestoApi.Core.Application.DTOs;

// ── Invitation (public, /api/onboarding/invitations) ─────────────────────────

public class InvitationPreviewDto
{
    public string RestaurantName { get; set; } = null!;
    public string Email { get; set; } = null!;
    public string Locale { get; set; } = null!;
    public DateTime ExpiresAt { get; set; }

    /// <summary>The documents the restaurateur must accept, at the versions in force now.</summary>
    public List<LegalDocumentRefDto> Documents { get; set; } = [];
}

public class LegalDocumentRefDto
{
    public string Key { get; set; } = null!;
    public string Version { get; set; } = null!;
}

public class AcceptInvitationRequest
{
    [Required]
    [StringLength(128, MinimumLength = 1)]
    public string Password { get; set; } = null!;

    [StringLength(100)]
    public string? DisplayName { get; set; }

    /// <summary>Every document of <c>LegalDocumentKeys.AcceptedAtSignUp</c>, at its current version.</summary>
    [Required]
    public List<LegalDocumentRefDto> AcceptedDocuments { get; set; } = [];
}

// ── The restaurateur's own space (/api/onboarding) ───────────────────────────

public class OnboardingMeDto
{
    public string Email { get; set; } = null!;
    public string? DisplayName { get; set; }
    public List<OnboardingRestaurantSummaryDto> Restaurants { get; set; } = [];
}

public class OnboardingRestaurantSummaryDto
{
    public int Id { get; set; }
    public string Name { get; set; } = null!;
    public string Status { get; set; } = null!;
}

public class OnboardingStateDto
{
    public int Id { get; set; }
    public string Name { get; set; } = null!;

    /// <summary><c>Draft</c>, <c>Published</c> or <c>Suspended</c>.</summary>
    public string Status { get; set; } = null!;

    /// <summary>What the platform told the restaurateur when it suspended the restaurant.</summary>
    public string? SuspensionReason { get; set; }

    public List<OnboardingStepDto> Steps { get; set; } = [];

    /// <summary>Where "resume" lands: the first step still to do; null when every step is settled.</summary>
    public string? NextStep { get; set; }

    public bool CanPublish { get; set; }

    /// <summary>The step keys that stand between the restaurant and going live.</summary>
    public List<string> PublishBlockers { get; set; } = [];

    public OnboardingInfoDto Info { get; set; } = new();
    public OnboardingHoursDto Hours { get; set; } = new();
    public OnboardingLayoutDto Layout { get; set; } = new();
    public OnboardingMenuDto Menu { get; set; } = new();
    public OnboardingBrandingDto Branding { get; set; } = new();
    public OnboardingLinksDto Links { get; set; } = new();
    public OnboardingCapabilitiesDto Capabilities { get; set; } = new();
}

public class OnboardingStepDto
{
    public string Key { get; set; } = null!;

    /// <summary><c>Todo</c>, <c>Done</c> or <c>Skipped</c>.</summary>
    public string State { get; set; } = null!;

    public bool CanSkip { get; set; }
}

public class OnboardingInfoDto
{
    public string Name { get; set; } = null!;
    public string? Address { get; set; }
    public string? PhoneNumber { get; set; }
    public string? EmailAddress { get; set; }
    public string? LegalName { get; set; }
    public string? CompanyNumber { get; set; }
    public string? VatNumber { get; set; }

    /// <summary>The restaurant's period; a restaurant with none yet shows the default of 12, which saving the step then fixes.</summary>
    public int BookingRetentionMonths { get; set; }
}

public class SaveOnboardingInfoRequest
{
    [Required]
    [StringLength(100, MinimumLength = 1)]
    public string Name { get; set; } = null!;

    [Required]
    [StringLength(250)]
    public string Address { get; set; } = null!;

    [Required]
    [StringLength(30)]
    public string PhoneNumber { get; set; } = null!;

    [Required]
    [StringLength(254)]
    public string EmailAddress { get; set; } = null!;

    /// <summary>The company as the legal notice names it.</summary>
    [Required]
    [StringLength(150)]
    public string LegalName { get; set; } = null!;

    /// <summary>The Belgian enterprise number (BCE/KBO), checked by its control digits.</summary>
    [Required]
    [StringLength(20)]
    public string CompanyNumber { get; set; } = null!;

    /// <summary>Optional. A blank value clears it.</summary>
    [StringLength(20)]
    public string? VatNumber { get; set; }

    /// <summary>Months a guest stays identifiable after the sitting (1 to 60). Missing keeps the current value, or fixes the default on a restaurant that has none.</summary>
    public int? BookingRetentionMonths { get; set; }
}

public class OnboardingHoursDto
{
    public List<DayHoursDto> OpenHours { get; set; } = [];

    /// <summary>The days the restaurant is closed are simply absent from <see cref="OpenHours"/>.</summary>
    public int DefaultBookingDurationMinutes { get; set; }
}

public class SaveOnboardingHoursRequest
{
    /// <summary>One entry per open day; a day with no entry is closed. At least one day is required.</summary>
    [Required]
    public List<DayHoursDto> OpenHours { get; set; } = [];

    [Range(15, 480)]
    public int? DefaultBookingDurationMinutes { get; set; }
}

public class OnboardingLayoutDto
{
    public List<OnboardingSectionDto> Sections { get; set; } = [];
}

public class OnboardingSectionDto
{
    /// <summary>Null for a section that does not exist yet.</summary>
    public int? Id { get; set; }

    [StringLength(60)]
    public string Name { get; set; } = null!;

    public List<OnboardingTableDto> Tables { get; set; } = [];
}

public class OnboardingTableDto
{
    public int? Id { get; set; }

    [StringLength(40)]
    public string? Name { get; set; }

    [Range(1, 50)]
    public int Seats { get; set; }
}

public class SaveOnboardingLayoutRequest
{
    /// <summary>The whole layout: what is missing from it is removed, and removing a table that has an upcoming booking is refused.</summary>
    [Required]
    public List<OnboardingSectionDto> Sections { get; set; } = [];
}

public class OnboardingMenuDto
{
    public int? MenuId { get; set; }
    public string Name { get; set; } = null!;
    public List<OnboardingMenuCategoryDto> Categories { get; set; } = [];
}

public class OnboardingMenuCategoryDto
{
    public int? Id { get; set; }

    [StringLength(80)]
    public string Name { get; set; } = null!;

    public List<OnboardingMenuItemDto> Items { get; set; } = [];
}

public class OnboardingMenuItemDto
{
    public int? Id { get; set; }

    [StringLength(100)]
    public string Name { get; set; } = null!;

    [StringLength(300)]
    public string? Description { get; set; }

    /// <summary>Cents. Null means "price on request".</summary>
    public long? PriceMinor { get; set; }

    /// <summary>EU allergen names, e.g. <c>["Gluten","Milk"]</c>. On a save, null leaves a stored dish as it is and an empty list clears it.</summary>
    public List<string>? Allergens { get; set; }

    /// <summary><c>Vegetarian</c>, <c>Vegan</c>, <c>GlutenFree</c>. Null on a save leaves a stored dish as it is.</summary>
    public List<string>? DietaryTags { get; set; }
}

public class SaveOnboardingMenuRequest
{
    [StringLength(80)]
    public string? Name { get; set; }

    [Required]
    public List<OnboardingMenuCategoryDto> Categories { get; set; } = [];
}

public class OnboardingBrandingDto
{
    /// <summary><c>Brasserie</c>, <c>Gastronomique</c> or <c>Cafe</c>.</summary>
    public string Theme { get; set; } = null!;

    /// <summary><c>#rrggbb</c>; null keeps the instance's colour.</summary>
    public string? PrimaryColor { get; set; }

    public string? Tagline { get; set; }
    public string? LogoUrl { get; set; }
}

public class SaveOnboardingBrandingRequest
{
    [Required]
    public string Theme { get; set; } = null!;

    /// <summary><c>#rrggbb</c>. A blank value goes back to the instance's colour.</summary>
    [StringLength(9)]
    public string? PrimaryColor { get; set; }

    [StringLength(140)]
    public string? Tagline { get; set; }
}

public class OnboardingLinksDto
{
    /// <summary>Public paths on this instance, set once the restaurant is published; null before.</summary>
    public string? SitePath { get; set; }
    public string? BookingPath { get; set; }
    public string? MenuPath { get; set; }

    /// <summary>The QR menu link and the booking link exist as soon as the restaurant does, for the preview.</summary>
    public string? MenuToken { get; set; }
}

public class OnboardingCapabilitiesDto
{
    /// <summary>Reserved: importing the first menu from a photo or a PDF. False until it exists.</summary>
    public bool MenuImport { get; set; }
}

/// <summary>What step 5 shows: the menu page and the booking page as a guest will meet them.</summary>
public class OnboardingPreviewDto
{
    public string RestaurantName { get; set; } = null!;
    public string? Address { get; set; }
    public string? PhoneNumber { get; set; }
    public List<DayHoursDto> OpenHours { get; set; } = [];
    public int TableCount { get; set; }
    public int LargestParty { get; set; }
    public int SlotIntervalMinutes { get; set; }
    public int BookingDurationMinutes { get; set; }
    public List<string> SampleSlots { get; set; } = [];
    public OnboardingMenuDto Menu { get; set; } = new();
    public string? PrimaryColor { get; set; }
    public string? LogoUrl { get; set; }
    public string? Tagline { get; set; }
}
