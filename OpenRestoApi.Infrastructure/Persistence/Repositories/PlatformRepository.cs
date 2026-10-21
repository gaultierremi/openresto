using CustomAccessibility.Attributes;
using Microsoft.EntityFrameworkCore;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Infrastructure.Persistence.Repositories;

[OnlyAccessibleBy("OpenRestoApi.Extensions.ServiceCollectionExtensions")]
[OnlyAccessibleBy("OpenRestoApi.Tests.Integration.PlatformRepositoryTests")]
[ExternalAccessAllowed]
internal class PlatformRepository(AppDbContext db) : IPlatformRepository
{
    private readonly AppDbContext _db = db;

    public async Task<List<PlatformRestaurantRow>> GetRestaurantRowsAsync(DateTime nowUtc)
    {
        var restaurants = await _db.Restaurants
            .AsNoTracking()
            .Where(r => !r.IsArchived)
            .OrderBy(r => r.Name)
            .Select(r => new
            {
                r.Id,
                r.Name,
                r.Status,
                r.PublishedAt,
                r.SuspendedAt,
                r.SuspensionReason,
                r.OnboardingSteps,
                r.BookingRetentionMonths,
                Total =_db.Bookings.Count(b => b.RestaurantId == r.Id && !b.IsCancelled),
                Upcoming = _db.Bookings.Count(b => b.RestaurantId == r.Id && !b.IsCancelled && b.Date > nowUtc),
            })
            .ToListAsync();

        // Dates are folded in memory: SQLite stores them as text and has no Max over them that
        // EF will translate.
        var members = await _db.RestaurantMembers
            .AsNoTracking()
            .Select(m => new { m.RestaurantId, m.CreatedAt, m.User!.Email, m.User.LastLoginAt })
            .ToListAsync();

        List<RestaurantInvitation> invitations = await _db.RestaurantInvitations.AsNoTracking().ToListAsync();

        return [.. restaurants.Select(r =>
        {
            var runners = members.Where(m => m.RestaurantId == r.Id).OrderBy(m => m.CreatedAt).ToList();
            return new PlatformRestaurantRow(
                r.Id,
                r.Name,
                r.Status,
                r.PublishedAt,
                r.SuspendedAt,
                r.SuspensionReason,
                r.OnboardingSteps,
                runners.FirstOrDefault()?.Email,
                runners.Max(m => m.LastLoginAt),
                r.Total,
                r.Upcoming,
                r.BookingRetentionMonths,
                invitations.Where(i => i.RestaurantId == r.Id).OrderByDescending(i => i.CreatedAt).ThenByDescending(i => i.Id).FirstOrDefault());
        })];
    }

    public async Task<Restaurant?> FindRestaurantAsync(int restaurantId)
        => await _db.Restaurants.FirstOrDefaultAsync(r => r.Id == restaurantId);

    public async Task<Restaurant?> FindMemberRestaurantAsync(int userId, int restaurantId)
        => await _db.RestaurantMembers
            .Where(m => m.UserId == userId && m.RestaurantId == restaurantId)
            .Select(m => m.Restaurant)
            .FirstOrDefaultAsync();

    public async Task<List<Restaurant>> GetMemberRestaurantsAsync(int userId)
        => await _db.RestaurantMembers
            .Where(m => m.UserId == userId)
            .Select(m => m.Restaurant!)
            .OrderBy(r => r.Name)
            .ToListAsync();

    public async Task<List<Restaurant>> GetAllRestaurantsAsync()
        => await _db.Restaurants.AsNoTracking().ToListAsync();

    public async Task<List<Section>> GetSectionsWithTablesAsync(int restaurantId)
        => await _db.Sections
            .Include(s => s.Tables)
            .Where(s => s.RestaurantId == restaurantId)
            .OrderBy(s => s.SortOrder).ThenBy(s => s.Id)
            .ToListAsync();

    public async Task<Restaurant> AddRestaurantAsync(Restaurant restaurant)
    {
        _db.Restaurants.Add(restaurant);
        await _db.SaveChangesAsync();
        return restaurant;
    }

    public void AddMember(RestaurantMember member) => _db.RestaurantMembers.Add(member);

    public async Task<RestaurantInvitation?> FindInvitationByHashAsync(string tokenHash)
        => await _db.RestaurantInvitations
            .Include(i => i.Restaurant)
            .FirstOrDefaultAsync(i => i.TokenHash == tokenHash);

    public async Task<List<RestaurantInvitation>> GetInvitationsAsync(int restaurantId)
        => await _db.RestaurantInvitations
            .Where(i => i.RestaurantId == restaurantId)
            .ToListAsync();

    public void AddInvitation(RestaurantInvitation invitation) => _db.RestaurantInvitations.Add(invitation);

    public void AddAcceptance(LegalAcceptance acceptance) => _db.LegalAcceptances.Add(acceptance);

    public async Task<List<LegalAcceptance>> GetAcceptancesAsync(int restaurantId)
        => await _db.LegalAcceptances
            .AsNoTracking()
            .Where(a => a.RestaurantId == restaurantId)
            .OrderBy(a => a.AcceptedAt).ThenBy(a => a.Id)
            .ToListAsync();

    public async Task<List<Booking>> GetRecentBookingsAsync(int restaurantId, int limit)
        => await _db.Bookings
            .AsNoTracking()
            .Where(b => b.RestaurantId == restaurantId)
            .OrderByDescending(b => b.Date)
            .Take(limit)
            .ToListAsync();

    public async Task<int> CountBookingsAsync(int restaurantId)
        => await _db.Bookings.CountAsync(b => b.RestaurantId == restaurantId);

    /// <seealso>PlatformRepositoryTests.ANotificationStaysIntact_WhileItsBookingIsInsideTheRetention_AndLosesTheNameOneSecondAfter</seealso>
    /// <seealso>PlatformRepositoryTests.TheNotificationOfAFutureBooking_OrAnotherRestaurantsExpiredOne_IsNeverTouched</seealso>
    public async Task<RetentionOutcome> AnonymizeBeforeAsync(int restaurantId, DateTime cutoffUtc, DateTime nowUtc)
    {
        // The devices, failed-mail rows and notifications go first: all are found through the
        // bookings that are about to lose the marker that identifies them as still to do.
        IQueryable<Booking> expired = _db.Bookings.Where(b =>
            b.RestaurantId == restaurantId
            && b.AnonymizedAt == null
            && (b.EndTime ?? b.Date) < cutoffUtc);

        int devices = await _db.GuestPushSubscriptions
            .Where(s => expired.Select(b => b.Id).Contains(s.BookingId))
            .ExecuteDeleteAsync();

        int failures = await _db.EmailFailures
            .Where(f => f.BookingRef != null && expired.Select(b => b.BookingRef).Contains(f.BookingRef))
            .ExecuteDeleteAsync();

        // The notification keeps its date, size and restaurant; only the name goes. The UI draws
        // nothing for an empty name (as it already does for "nearly full"), so there is no fallback.
        int notifications = await _db.AdminNotifications
            .Where(n => n.RestaurantId == restaurantId
                && n.BookingId != null
                && n.CustomerName != string.Empty
                && expired.Select(b => b.Id).Contains(n.BookingId.Value))
            .ExecuteUpdateAsync(set => set.SetProperty(n => n.CustomerName, string.Empty));

        int bookings = await expired.ExecuteUpdateAsync(set => set
            .SetProperty(b => b.CustomerName, (string?)null)
            .SetProperty(b => b.CustomerEmail, (string?)null)
            .SetProperty(b => b.SpecialRequests, (string?)null)
            .SetProperty(b => b.AnonymizedAt, nowUtc));

        int tickets = await _db.WaitlistEntries
            .Where(w => w.RestaurantId == restaurantId
                && w.ClosedAt != null
                && w.ClosedAt < cutoffUtc
                && (w.Name != "" || w.Email != null || w.PushEndpoint != null))
            .ExecuteUpdateAsync(set => set
                .SetProperty(w => w.Name, string.Empty)
                .SetProperty(w => w.Email, (string?)null)
                .SetProperty(w => w.PushChannel, (string?)null)
                .SetProperty(w => w.PushEndpoint, (string?)null)
                .SetProperty(w => w.PushP256dh, (string?)null)
                .SetProperty(w => w.PushAuth, (string?)null));

        return new RetentionOutcome(bookings, tickets, devices, failures, notifications);
    }

    public async Task SaveChangesAsync() => await _db.SaveChangesAsync();
}
