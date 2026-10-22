using System.Globalization;
using System.Text.Json;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Services;

public sealed class RestaurantOperationsService(OnboardingService onboarding, IPlatformRepository platform,
    IBookingRepository bookings, IMenuRepository menus, IWaitlistRepository tickets, WaitlistService waitlist,
    AdminService admin, ISystemClock clock)
{
    public async Task<RestaurantOperationsDto> GetAsync(int restaurantId)
    {
        Restaurant restaurant = await onboarding.RequireRestaurantAsync(restaurantId, false);
        DateTime today = TimeZoneHelper.ConvertUtcToLocal(clock.UtcNow, restaurant.Timezone).Date;
        DateTime monday = today.AddDays(1 - IsoDay.Of(today));
        DateTime start = Utc(monday, restaurant);
        DateTime end = Utc(monday.AddDays(7), restaurant);
        List<Booking> rows = await bookings.GetForRestaurantInUtcRangeAsync(restaurantId, Utc(monday.AddDays(-1), restaurant), end);
        List<Section> sections = await platform.GetSectionsWithTablesAsync(restaurantId);
        int seats = sections.SelectMany(s => s.Tables).Sum(t => t.Seats);
        List<OperationsDayDto> days = [.. Enumerable.Range(0, 7).Select(offset => Day(restaurant, monday.AddDays(offset), rows, seats))];
        List<Menu> cards = await menus.GetMenusWithContentAsync(restaurantId);
        return new(restaurant.Name, restaurant.Timezone, restaurant.Status.ToString(), DateKey(today), days,
            [.. rows.Where(b => b.Date >= start).OrderBy(b => b.Date).ThenBy(b => b.Id).Select(b => new OperationsBookingDto(b.Id, b.BookingRef,
                b.CustomerName, b.CustomerEmail, b.Date, b.Seats, b.Status.ToString(), b.IsCancelled,
                b.EmailReminderOutcome, [.. b.NextStatuses(clock.UtcNow).Select(s => s.ToString())]))],
            [.. cards.SelectMany(m => m.Categories).SelectMany(c => c.Items).Where(i => i.QrViews > 0)
                .OrderByDescending(i => i.QrViews).ThenBy(i => i.Name).Take(5).Select(i => new DishViewsDto(i.Name, i.QrViews))],
            [.. ServiceException.Read(restaurant).OrderBy(e => e.Date)], restaurant.SimulateEmailReminders);
    }

    public async Task SaveExceptionAsync(int id, SaveServiceExceptionRequest req)
    {
        Restaurant restaurant = await onboarding.RequireRestaurantAsync(id);
        DateTime date = ParseDate(req.Date);
        if ((!req.Closed && (!ValidTime(req.Open) || !ValidTime(req.Close)))
            || date < TimeZoneHelper.ConvertUtcToLocal(clock.UtcNow, restaurant.Timezone).Date)
            throw Invalid("Choisissez une date à venir et des heures au format HH:mm.");
        List<ServiceException> all = ServiceException.Read(restaurant);
        all.RemoveAll(e => e.Date == req.Date);
        if (all.Count >= 100) throw Invalid("Vous pouvez prévoir jusqu’à 100 exceptions.");
        all.Add(new(req.Date, req.Closed, req.Closed ? "00:00" : req.Open, req.Closed ? "00:00" : req.Close));
        restaurant.ServiceExceptionsJson = JsonSerializer.Serialize(all);
        await platform.SaveChangesAsync();
    }

    public async Task RemoveExceptionAsync(int id, string date)
    {
        Restaurant restaurant = await onboarding.RequireRestaurantAsync(id);
        ParseDate(date);
        List<ServiceException> all = ServiceException.Read(restaurant);
        all.RemoveAll(e => e.Date == date);
        restaurant.ServiceExceptionsJson = JsonSerializer.Serialize(all);
        await platform.SaveChangesAsync();
    }

    public async Task SetReminderModeAsync(int id, bool simulated)
    {
        Restaurant restaurant = await onboarding.RequireRestaurantAsync(id);
        restaurant.SimulateEmailReminders = simulated;
        await platform.SaveChangesAsync();
    }

    public async Task SetStatusAsync(int id, int bookingId, string status)
    {
        await onboarding.RequireRestaurantAsync(id);
        Booking? booking = await bookings.GetByIdAsync(bookingId);
        if (booking is null || booking.RestaurantId != id) throw Missing();
        await admin.SetBookingStatusAsync(bookingId, status);
    }

    public async Task<WaitlistBoardDto> GetWaitlistAsync(int id)
    {
        Restaurant restaurant = await onboarding.RequireRestaurantAsync(id, false);
        if (!restaurant.IsListedPublicly) return new WaitlistBoardDto { RestaurantId = id };
        return await waitlist.GetBoardAsync(id);
    }

    public async Task AddWaitlistAsync(int id, JoinWaitlistRequest req)
    {
        await onboarding.RequireRestaurantAsync(id);
        await waitlist.AddByStaffAsync(id, req);
    }

    public async Task ActOnWaitlistAsync(int id, int entryId, string action)
    {
        await onboarding.RequireRestaurantAsync(id);
        WaitlistEntry? entry = await tickets.GetByIdAsync(entryId);
        if (entry is null || entry.RestaurantId != id) throw Missing();
        switch (action)
        {
            case "seat": await waitlist.SeatAsync(entryId, new()); break;
            case "remove": await waitlist.RemoveAsync(entryId); break;
            default: throw Invalid("Action inconnue.");
        }
    }

    public async Task<string> ExportAsync(int id)
    {
        RestaurantOperationsDto data = await GetAsync(id);
        return "\uFEFFRéférence;Client;E-mail;Date locale;Couverts;État;Rappel\r\n" + string.Join("\r\n", data.Bookings.Select(b => string.Join(';',
            new[] { b.Reference, b.Name, b.Email,
                TimeZoneHelper.ConvertUtcToLocal(b.Date, data.Timezone).ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
                b.Seats.ToString(CultureInfo.InvariantCulture), b.Cancelled ? "Annulée" : b.Status, b.Reminder }.Select(Csv))));
    }

    public static string Csv(string? value)
    {
        string text = value ?? "";
        if (text.TrimStart().FirstOrDefault() is '=' or '+' or '-' or '@' || text.StartsWith('\t') || text.StartsWith('\r')) text = "'" + text;
        return "\"" + text.Replace("\"", "\"\"", StringComparison.Ordinal) + "\"";
    }

    private static OperationsDayDto Day(Restaurant restaurant, DateTime day, List<Booking> rows, int seats)
    {
        List<Booking> onDay = [.. rows.Where(b => TimeZoneHelper.ConvertUtcToLocal(b.Date, restaurant.Timezone).Date == day && !b.IsCancelled)];
        double? fill = null;
        List<(DateTime Start, DateTime End)> windows = OpeningWindows(restaurant, day);
        if (seats > 0 && windows.Count > 0)
        {
            double occupied = rows.Where(b => !b.IsCancelled && b.Status != BookingStatus.NoShow).Sum(b => windows.Sum(w =>
                Math.Max(0, (new[] { b.EndTime ?? b.Date.AddMinutes(restaurant.DefaultBookingDurationMinutes), w.End }.Min()
                    - new[] { b.Date, w.Start }.Max()).TotalMinutes) * b.Seats));
            double openMinutes = windows.Sum(w => (w.End - w.Start).TotalMinutes);
            fill = Math.Round(Math.Clamp(occupied / (openMinutes * seats) * 100, 0, 100), 1);
        }
        return new(DateKey(day), onDay.Count, onDay.Sum(b => b.Seats), onDay.Count(b => b.Status == BookingStatus.NoShow), fill);
    }

    private static List<(DateTime Start, DateTime End)> OpeningWindows(Restaurant restaurant, DateTime day)
    {
        DateTime startUtc = Utc(day, restaurant), endUtc = Utc(day.AddDays(1), restaurant);
        var windows = new List<(DateTime Start, DateTime End)>();
        foreach (DateTime openingDay in new[] { day.AddDays(-1), day })
        {
            if (!ServiceWindowHelper.IsOpenOn(restaurant, openingDay)) continue;
            (DateTime start, DateTime end) = ServiceWindowHelper.LocalWindowFor(restaurant, openingDay, IsoDay.Of(openingDay));
            DateTime from = new[] { Utc(start, restaurant), startUtc }.Max();
            DateTime to = new[] { Utc(end, restaurant), endUtc }.Min();
            if (from >= to) continue;
            if (windows.Count > 0 && windows[^1].End >= from)
                windows[^1] = (windows[^1].Start, new[] { windows[^1].End, to }.Max());
            else windows.Add((from, to));
        }
        return windows;
    }

    private static bool ValidTime(string value) => value is { Length: 5 } && TimeOnly.TryParseExact(value, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
    private static DateTime ParseDate(string value) => DateTime.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out DateTime date)
        ? date : throw Invalid("La date doit être au format AAAA-MM-JJ.");
    private static DateTime Utc(DateTime local, Restaurant restaurant) => TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), TimeZoneHelper.Resolve(restaurant.Timezone));
    private static string DateKey(DateTime date) => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    private static ValidationException Invalid(string message) => new(message) { Code = "operations.invalid" };
    private static NotFoundException Missing() => new("Élément introuvable.") { Code = ErrorCodes.PlatformNotFound };
}
