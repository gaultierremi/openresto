using CustomAccessibility.Attributes;
using Microsoft.EntityFrameworkCore;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Infrastructure.Persistence.Repositories;

[OnlyAccessibleBy("OpenRestoApi.Extensions.ServiceCollectionExtensions")]
[ExternalAccessAllowed]
internal sealed class RestaurantOperationsRepository(AppDbContext db) : IRestaurantOperationsRepository
{
    public async Task IncrementDishViewsAsync(int itemId)
        => await db.MenuItems.Where(i => i.Id == itemId).ExecuteUpdateAsync(s => s.SetProperty(i => i.QrViews, i => i.QrViews + 1));

    public async Task<List<Booking>> DueEmailRemindersAsync(DateTime now)
        => await db.Bookings.Include(b => b.Restaurant).Where(b => !b.IsCancelled && b.Status == BookingStatus.Booked
            && b.AnonymizedAt == null && !string.IsNullOrEmpty(b.CustomerEmail) && b.EmailReminderProcessedAt == null
            && b.Date > now && b.Date <= now.AddHours(24) && b.Restaurant!.Status == RestaurantStatus.Published
            && !b.Restaurant.IsArchived).OrderBy(b => b.Date).Take(100).AsNoTracking().ToListAsync();

    public async Task<bool> ClaimEmailReminderAsync(int bookingId, DateTime now, string outcome)
        => await db.Bookings.Where(b => b.Id == bookingId && b.EmailReminderProcessedAt == null
            && !b.IsCancelled && b.Status == BookingStatus.Booked && b.Date > now && b.AnonymizedAt == null)
            .ExecuteUpdateAsync(s => s.SetProperty(b => b.EmailReminderProcessedAt, now)
                .SetProperty(b => b.EmailReminderOutcome, outcome)) == 1;

    public async Task SetEmailReminderOutcomeAsync(int bookingId, string outcome)
        => await db.Bookings.Where(b => b.Id == bookingId).ExecuteUpdateAsync(s => s.SetProperty(b => b.EmailReminderOutcome, outcome));
}
