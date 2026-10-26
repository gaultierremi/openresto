using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Interfaces;

public interface IRestaurantOperationsRepository
{
    Task IncrementDishViewsAsync(int itemId);
    Task<List<Booking>> DueEmailRemindersAsync(DateTime now);
    Task<bool> ClaimEmailReminderAsync(int bookingId, DateTime now, string outcome);
    Task SetEmailReminderOutcomeAsync(int bookingId, string outcome);
}
