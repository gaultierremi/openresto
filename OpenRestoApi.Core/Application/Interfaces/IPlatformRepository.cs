using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Interfaces;

/// <summary>One line of the platform's restaurants list: counts and dates, never a guest.</summary>
public sealed record PlatformRestaurantRow(
    int Id,
    string Name,
    RestaurantStatus Status,
    DateTime? PublishedAt,
    DateTime? SuspendedAt,
    string? SuspensionReason,
    string? OnboardingSteps,
    string? OwnerEmail,
    DateTime? LastLoginAt,
    int TotalBookings,
    int UpcomingBookings,
    RestaurantInvitation? LatestInvitation);

/// <summary>What the retention pass removed in one run, for the log line (counts only).</summary>
public sealed record RetentionOutcome(int Bookings, int WaitlistEntries, int PushSubscriptions, int EmailFailures)
{
    public int Total => Bookings + WaitlistEntries + PushSubscriptions + EmailFailures;
}

/// <summary>
/// Persistence for the platform and onboarding side: restaurants as the platform sees them,
/// who runs which restaurant, invitations, the consent journal, and the retention pass. Every
/// lookup a restaurateur makes goes through a membership, so a restaurant they do not run is a
/// miss, exactly like one that does not exist.
/// </summary>
public interface IPlatformRepository
{
    Task<List<PlatformRestaurantRow>> GetRestaurantRowsAsync(DateTime nowUtc);

    /// <summary>The restaurant with no archived or status filter; the platform sees every state.</summary>
    Task<Restaurant?> FindRestaurantAsync(int restaurantId);

    /// <summary>The restaurant, but only when <paramref name="userId"/> runs it.</summary>
    Task<Restaurant?> FindMemberRestaurantAsync(int userId, int restaurantId);

    Task<List<Restaurant>> GetMemberRestaurantsAsync(int userId);

    Task<List<Restaurant>> GetAllRestaurantsAsync();

    /// <summary>The restaurant's rooms with their tables, whatever its status.</summary>
    Task<List<Section>> GetSectionsWithTablesAsync(int restaurantId);

    Task<Restaurant> AddRestaurantAsync(Restaurant restaurant);

    void AddMember(RestaurantMember member);

    Task<RestaurantInvitation?> FindInvitationByHashAsync(string tokenHash);

    /// <summary>Every invitation ever sent for the restaurant, whatever became of it.</summary>
    Task<List<RestaurantInvitation>> GetInvitationsAsync(int restaurantId);

    void AddInvitation(RestaurantInvitation invitation);

    void AddAcceptance(LegalAcceptance acceptance);

    Task<List<LegalAcceptance>> GetAcceptancesAsync(int restaurantId);

    /// <summary>The restaurant's latest bookings, newest first, with the guest's details.</summary>
    Task<List<Booking>> GetRecentBookingsAsync(int restaurantId, int limit);

    Task<int> CountBookingsAsync(int restaurantId);

    /// <summary>
    /// Strips name, address and notes from the restaurant's bookings that ended before
    /// <paramref name="cutoffUtc"/>, drops the reminder devices and failed-mail records that
    /// belonged to them, and does the same for closed waitlist tickets. The booking rows stay.
    /// </summary>
    Task<RetentionOutcome> AnonymizeBeforeAsync(int restaurantId, DateTime cutoffUtc, DateTime nowUtc);

    Task SaveChangesAsync();
}
