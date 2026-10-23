using System.Globalization;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Launch;

public static class GuestBookingTimes
{
    public const int MaximumAdvanceDays = 90;

    public static List<GuestSlot> Slots(AvailabilityResponseDto availability, DateTime day, string timezoneId, DateTime nowUtc)
    {
        TimeZoneInfo timezone = TimeZoneHelper.Resolve(timezoneId);
        var result = new List<GuestSlot>();
        TimeSpan previous = TimeSpan.Zero;
        int offset = 0;
        foreach (TimeSlotDto slot in availability.Slots)
        {
            if (!TimeSpan.TryParseExact(slot.Time, "hh\\:mm", CultureInfo.InvariantCulture, out TimeSpan time)) continue;
            if (time < previous) offset++;
            previous = time;
            DateTime local = DateTime.SpecifyKind(day.Date.AddDays(offset).Add(time), DateTimeKind.Unspecified);
            if (timezone.IsInvalidTime(local)) continue;
            DateTime utc = TimeZoneInfo.ConvertTimeToUtc(local, timezone);
            if (slot.IsAvailable && utc > nowUtc)
                result.Add(new GuestSlot(utc.ToString("O", CultureInfo.InvariantCulture), slot.Time + (offset > 0 ? " (le lendemain)" : "")));
        }
        return result;
    }
}
