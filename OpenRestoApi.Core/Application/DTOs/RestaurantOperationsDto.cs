using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.DTOs;

public sealed record OperationsBookingDto(int Id, string Reference, string? Name, string? Email,
    DateTime Date, int Seats, string Status, bool Cancelled, string? Reminder, List<string> NextStatuses);
public sealed record OperationsDayDto(string Date, int Bookings, int Covers, int NoShows, double? FillRate);
public sealed record DishViewsDto(string Name, long Views);
public sealed record RestaurantOperationsDto(string Name, string Timezone, string Status,
    string Today, List<OperationsDayDto> Days, List<OperationsBookingDto> Bookings,
    List<DishViewsDto> Dishes, List<ServiceException> Exceptions, bool SimulateEmailReminders);
public sealed record SaveServiceExceptionRequest(string Date, bool Closed, string Open, string Close);
public sealed record ReminderModeRequest(bool Simulated);
public sealed record BookingStatusRequest(string Status);
