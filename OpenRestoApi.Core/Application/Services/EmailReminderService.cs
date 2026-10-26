using System.Net;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Services;

public sealed class EmailReminderService(IRestaurantOperationsRepository repository, IEmailService mail, ISystemClock clock)
{
    public async Task<int> SendDueAsync()
    {
        DateTime now = clock.UtcNow;
        int processed = 0;
        foreach (Booking booking in await repository.DueEmailRemindersAsync(now))
        {
            Restaurant restaurant = booking.Restaurant!;
            string outcome = restaurant.SimulateEmailReminders ? "simulated" : "pending";
            if (!await repository.ClaimEmailReminderAsync(booking.Id, now, outcome)) continue;
            processed++;
            if (restaurant.SimulateEmailReminders) continue;
            try
            {
                (string title, string body) = GuestReminderCopy.Build(booking.Locale ?? "fr", restaurant.Name,
                    TimeZoneHelper.ConvertUtcToLocal(booking.Date, restaurant.Timezone),
                    TimeZoneHelper.ConvertUtcToLocal(now, restaurant.Timezone), booking.Seats, booking.BookingRef);
                await mail.SendEmailAsync(booking.CustomerEmail!, title, $"<p>{WebUtility.HtmlEncode(body)}</p>");
                await repository.SetEmailReminderOutcomeAsync(booking.Id, "sent");
            }
            catch (Exception)
            {
                await repository.SetEmailReminderOutcomeAsync(booking.Id, "failed");
            }
        }
        return processed;
    }
}
