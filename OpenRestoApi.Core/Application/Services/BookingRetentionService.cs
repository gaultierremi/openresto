using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Services;

/// <summary>
/// The end of a guest's identifiability. Each restaurant keeps its guests for its own
/// <see cref="Restaurant.BookingRetentionMonths"/> after the sitting; once that is past, the
/// booking loses the name, address and notes of the person who made it and keeps its date, party
/// size and table. Archived and suspended restaurants are included: their guests' clock does not stop.
/// <para>
/// A restaurant with no period (null) or an out-of-bounds one is passed over rather than
/// anonymised with it — neither may ever be read as zero or as the default, because that would
/// erase guests nobody agreed to erase.
/// </para>
/// </summary>
/// <seealso>BookingRetentionServiceTests.Run_AnonymisesOnlyWhatIsPastEachRestaurantsOwnPeriod</seealso>
/// <seealso>BookingRetentionServiceTests.Run_SkipsARestaurantWhoseStoredPeriodIsOutOfBounds</seealso>
/// <seealso>BookingRetentionServiceTests.Run_SkipsARestaurantWithNoPeriod_EvenWhenItHoldsFiveYearOldBookings</seealso>
/// <seealso>PlatformRepositoryTests.ARestaurantWithNoPeriod_IsNeverErasedFrom_UntilOneIsFixed</seealso>
public class BookingRetentionService(IPlatformRepository repository, ISystemClock clock)
{
    private readonly IPlatformRepository _repo = repository;
    private readonly ISystemClock _clock = clock;

    public async Task<RetentionOutcome> RunAsync()
    {
        DateTime now = _clock.UtcNow;
        int bookings = 0, tickets = 0, devices = 0, failures = 0, notifications = 0;

        foreach (Restaurant restaurant in await _repo.GetAllRestaurantsAsync())
        {
            if (restaurant.BookingRetentionMonths is not { } months || !BookingRetention.IsValid(months))
            {
                continue;
            }

            RetentionOutcome outcome = await _repo.AnonymizeBeforeAsync(
                restaurant.Id, BookingRetention.CutoffUtc(now, months), now);
            bookings += outcome.Bookings;
            tickets += outcome.WaitlistEntries;
            devices += outcome.PushSubscriptions;
            failures += outcome.EmailFailures;
            notifications += outcome.Notifications;
        }

        return new RetentionOutcome(bookings, tickets, devices, failures, notifications);
    }
}
