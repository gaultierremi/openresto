using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Services;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Integration;

public sealed class RestaurantOperationsTests(TestWebAppFactory factory) : IClassFixture<TestWebAppFactory>, IDisposable
{
    private readonly PlatformHarness _h = new(factory);
    public void Dispose() => _h.Dispose();
    private static string Root(int id) => $"/api/onboarding/restaurants/{id}/operations";

    private async Task<(int Id, HttpClient Client, int Table)> SetupAsync()
    {
        (int id, HttpClient client) = await _h.RunningRestaurantAsync();
        await _h.CompleteRequiredStepsAsync(client, id);
        int table = await _h.InDbAsync(async db =>
        {
            Restaurant restaurant = await db.Restaurants.FindAsync(id) ?? throw new InvalidOperationException();
            restaurant.Status = RestaurantStatus.Published;
            restaurant.Timezone = "UTC";
            restaurant.OpenDays = "1,2,3,4,5,6,7";
            restaurant.OpenHoursJson = null;
            restaurant.OpenTime = "12:00";
            restaurant.CloseTime = "22:00";
            await db.SaveChangesAsync();
            return await db.Tables.Where(t => t.Section!.RestaurantId == id).Select(t => t.Id).FirstAsync();
        });
        return (id, client, table);
    }

    private async Task<int> BookingAsync(int id, int table, DateTime date, Action<Booking>? change = null)
        => await _h.InDbAsync(async db =>
        {
            var booking = new Booking { RestaurantId = id, TableId = table, Date = date, EndTime = date.AddHours(1),
                Seats = 2, CustomerName = "=SUM(1;2)\"", CustomerEmail = "guest@example.test", BookingRef = Guid.NewGuid().ToString("N") };
            change?.Invoke(booking);
            db.Bookings.Add(booking);
            await db.SaveChangesAsync();
            return booking.Id;
        });

    [Fact]
    public async Task Dashboard_UsesTheLocalWeek_ExcludesCancelled_AndExportsSafeCsv()
    {
        (int id, HttpClient client, int table) = await SetupAsync();
        DateTime today = DateTime.UtcNow.Date.AddHours(12);
        int booked = await BookingAsync(id, table, today);
        await BookingAsync(id, table, today.AddHours(1), b => b.Status = BookingStatus.NoShow);
        await BookingAsync(id, table, today.AddHours(2), b => b.IsCancelled = true);
        await BookingAsync(id, table, today.AddDays(7));
        HttpResponseMessage response = await client.GetAsync(Root(id));
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("no-store", response.Headers.CacheControl!.ToString());
        RestaurantOperationsDto dto = (await response.Content.ReadFromJsonAsync<RestaurantOperationsDto>())!;
        OperationsDayDto day = dto.Days.Single(d => d.Date == today.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture));
        Assert.Equal(7, dto.Days.Count);
        Assert.Equal(2, day.Bookings);
        Assert.Equal(4, day.Covers);
        Assert.Equal(1, day.NoShows);
        Assert.Equal(1.7, day.FillRate);
        Assert.Equal(2, dto.Bookings.Count);
        Assert.Contains(dto.Bookings, b => b.Id == booked);
        string csv = await client.GetStringAsync(Root(id) + "/export.csv");
        Assert.StartsWith("\uFEFFRéférence;", csv);
        Assert.Contains("\"'=SUM(1;2)\"\"\"", csv);
        Assert.Equal(2, csv.Split("guest@example.test").Length - 1);
    }

    [Fact]
    public async Task AnotherRestaurantsId_IsANotFound_ForEveryOperation_AndNothingIsWritten()
    {
        (int id, HttpClient owner, int table) = await SetupAsync();
        (_, HttpClient other) = await _h.RunningRestaurantAsync();
        int booking = await BookingAsync(id, table, DateTime.UtcNow.AddHours(2));
        string root = Root(id);
        foreach (string path in new[] { "", "/export.csv", "/waitlist" })
            Assert.Equal(HttpStatusCode.NotFound, (await other.GetAsync(root + path)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.PutAsJsonAsync(root + "/exceptions", new { date = "2099-01-01", closed = true, open = "12:00", close = "22:00" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.DeleteAsync(root + "/exceptions/2099-01-01")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.PutAsJsonAsync(root + "/reminders", new { simulated = false })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.PutAsJsonAsync(root + $"/bookings/{booking}/status", new { status = "Arrived" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsJsonAsync(root + "/waitlist", new { name = "Intrus", seats = 2 })).StatusCode);
        foreach (string action in new[] { "seat", "remove" })
            Assert.Equal(HttpStatusCode.NotFound, (await other.PostAsJsonAsync(root + $"/waitlist/1/{action}", new { })).StatusCode);
        await _h.InDbAsync(async db =>
        {
            Restaurant restaurant = (await db.Restaurants.FindAsync(id))!;
            Assert.Null(restaurant.ServiceExceptionsJson);
            Assert.True(restaurant.SimulateEmailReminders);
            Assert.Equal(BookingStatus.Booked, (await db.Bookings.FindAsync(booking))!.Status);
            Assert.False(await db.WaitlistEntries.AnyAsync(e => e.RestaurantId == id));
        });
        Assert.Equal(HttpStatusCode.Forbidden, (await _h.Operator().GetAsync(root)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _h.Client().GetAsync(root)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync(Root(int.MaxValue))).StatusCode);
    }

    [Fact]
    public async Task ForeignBookingAndTicket_AreNotFound_EvenUnderAnOwnedRestaurant()
    {
        (int own, HttpClient client, _) = await SetupAsync();
        (int foreign, HttpClient other, int table) = await SetupAsync();
        int booking = await BookingAsync(foreign, table, DateTime.UtcNow.AddHours(1));
        (await other.PostAsJsonAsync(Root(foreign) + "/waitlist", new { name = "Client", seats = 2 })).EnsureSuccessStatusCode();
        int entry = await _h.InDbAsync(db => db.WaitlistEntries.Where(e => e.RestaurantId == foreign).Select(e => e.Id).SingleAsync());
        Assert.Equal(HttpStatusCode.NotFound, (await client.PutAsJsonAsync(Root(own) + $"/bookings/{booking}/status", new { status = "Arrived" })).StatusCode);
        foreach (string action in new[] { "seat", "remove" })
            Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(Root(own) + $"/waitlist/{entry}/{action}", new { })).StatusCode);
        await _h.InDbAsync(async db =>
        {
            Assert.Equal(BookingStatus.Booked, (await db.Bookings.FindAsync(booking))!.Status);
            Assert.Equal(WaitlistStatus.Waiting, (await db.WaitlistEntries.FindAsync(entry))!.Status);
        });
    }

    [Fact]
    public async Task Closure_StopsAvailabilityHoldsAndBookings_WithoutDeletingExistingReservations()
    {
        (int id, HttpClient client, int table) = await SetupAsync();
        DateTime day = DateTime.UtcNow.Date.AddDays(2);
        string date = day.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
        int booking = await BookingAsync(id, table, day.AddHours(14));
        Assert.Equal(HttpStatusCode.NoContent, (await client.PutAsJsonAsync(Root(id) + "/exceptions", new { date, closed = true, open = "12:00", close = "22:00" })).StatusCode);
        AvailabilityResponseDto availability = (await _h.Client().GetFromJsonAsync<AvailabilityResponseDto>($"/api/restaurants/{id}/availability?date={date}&seats=2"))!;
        Assert.Empty(availability.Slots);
        HttpResponseMessage hold = await _h.Client().PostAsJsonAsync("/api/holds", new { restaurantId = id, date = day.AddHours(13), seats = 2 });
        Assert.Equal(HttpStatusCode.BadRequest, hold.StatusCode);
        HttpResponseMessage refused = await _h.Client().PostAsJsonAsync("/api/bookings", new { restaurantId = id, tableId = table, date = day.AddHours(13), seats = 2, customerName = "Test", customerEmail = "test@example.test" });
        Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
        await _h.InDbAsync(async db =>
        {
            Assert.NotNull(await db.Bookings.FindAsync(booking));
            Assert.Equal(1, await db.Bookings.CountAsync(b => b.RestaurantId == id));
        });
        (await client.DeleteAsync(Root(id) + $"/exceptions/{date}")).EnsureSuccessStatusCode();
        availability = (await _h.Client().GetFromJsonAsync<AvailabilityResponseDto>($"/api/restaurants/{id}/availability?date={date}&seats=2"))!;
        Assert.NotEmpty(availability.Slots);
    }

    [Theory]
    [InlineData("2099-02-30", "12:00")]
    [InlineData("2099-01-01", "25:00")]
    [InlineData("2000-01-01", "12:00")]
    public async Task InvalidException_Returns400_AndWritesNothing(string date, string open)
    {
        (int id, HttpClient client, _) = await SetupAsync();
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync(Root(id) + "/exceptions", new { date, open, close = "22:00", closed = false })).StatusCode);
        Assert.Null(await _h.InDbAsync(db => db.Restaurants.Where(r => r.Id == id).Select(r => r.ServiceExceptionsJson).SingleAsync()));
    }

    [Fact]
    public async Task SuspendedRestaurant_CanBeRead_ButRefusesWrites()
    {
        (int id, HttpClient client, _) = await SetupAsync();
        await _h.InDbAsync(async db => { (await db.Restaurants.FindAsync(id))!.Status = RestaurantStatus.Suspended; await db.SaveChangesAsync(); });
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(Root(id))).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync(Root(id) + "/reminders", new { simulated = false })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync(Root(id) + "/exceptions", new { date = "2099-01-01", open = "12:00", close = "22:00", closed = true })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.PostAsJsonAsync(Root(id) + "/waitlist", new { name = "Test", seats = 2 })).StatusCode);
        await _h.InDbAsync(async db => { Restaurant r = (await db.Restaurants.FindAsync(id))!; Assert.True(r.SimulateEmailReminders); Assert.Null(r.ServiceExceptionsJson); });
    }

    [Theory]
    [InlineData(true, false, "simulated")]
    [InlineData(false, false, "sent")]
    [InlineData(false, true, "failed")]
    public async Task Reminder_IsSimulatedByDefault_OrSentOnce_AndFailureIsNotRetried(bool simulate, bool fail, string outcome)
    {
        (int id, _, int table) = await SetupAsync();
        if (!simulate) await _h.InDbAsync(async db => { (await db.Restaurants.FindAsync(id))!.SimulateEmailReminders = false; await db.SaveChangesAsync(); });
        int booking = await BookingAsync(id, table, DateTime.UtcNow.AddHours(2));
        int cancelled = await BookingAsync(id, table, DateTime.UtcNow.AddHours(3), b => b.IsCancelled = true);
        int past = await BookingAsync(id, table, DateTime.UtcNow.AddHours(-1));
        int later = await BookingAsync(id, table, DateTime.UtcNow.AddHours(25));
        _h.Mail.Fail = fail;
        int before = _h.Mail.Sent.Count;
        using IServiceScope scope = _h.App.Services.CreateScope();
        var service = scope.ServiceProvider.GetRequiredService<EmailReminderService>();
        await service.SendDueAsync();
        await service.SendDueAsync();
        Assert.Equal(before + (!simulate && !fail ? 1 : 0), _h.Mail.Sent.Count);
        await _h.InDbAsync(async db =>
        {
            Assert.Equal(outcome, (await db.Bookings.FindAsync(booking))!.EmailReminderOutcome);
            foreach (int untouched in new[] { cancelled, past, later }) Assert.Null((await db.Bookings.FindAsync(untouched))!.EmailReminderProcessedAt);
        });
    }

    [Theory]
    [InlineData("=1+1")]
    [InlineData(" @SUM(1)")]
    [InlineData("\tcmd")]
    public void Csv_PrefixesSpreadsheetFormulas(string input) => Assert.StartsWith("\"'", RestaurantOperationsService.Csv(input));

    [Fact]
    public async Task Occupancy_IncludesThePreviousServicesAfterMidnightTail()
    {
        (int id, HttpClient client, int table) = await SetupAsync();
        await _h.InDbAsync(async db => { Restaurant r = (await db.Restaurants.FindAsync(id))!; r.OpenTime = "23:00"; r.CloseTime = "02:00"; await db.SaveChangesAsync(); });
        DateTime today = DateTime.UtcNow.Date;
        await BookingAsync(id, table, today.AddMinutes(-30));
        RestaurantOperationsDto dto = (await client.GetFromJsonAsync<RestaurantOperationsDto>(Root(id)))!;
        OperationsDayDto day = dto.Days.Single(d => d.Date == dto.Today);
        Assert.Equal(0, day.Bookings);
        Assert.Equal(2.8, day.FillRate);
    }

    [Fact]
    public async Task QrViews_CountOnlyAPublishedVisibleDish_AndExposeNoInternalItemId()
    {
        (int id, HttpClient client, _) = await SetupAsync();
        (await client.PutAsJsonAsync($"/api/onboarding/restaurants/{id}/menu", PlatformHarness.Menu())).EnsureSuccessStatusCode();
        string token = await _h.InDbAsync(async db =>
        {
            (await db.Menus.SingleAsync(m => m.RestaurantId == id)).IsPublished = true;
            await db.SaveChangesAsync();
            return (await db.Restaurants.FindAsync(id))!.PublicToken;
        });
        PublicMenuResponse menu = (await _h.Client().GetFromJsonAsync<PublicMenuResponse>($"/api/menus/r/{token}"))!;
        string view = menu.Menus[0].Categories[0].Items[0].ViewToken;
        Assert.Matches("^[a-f0-9]{64}$", view);
        Assert.Equal(HttpStatusCode.NoContent, (await _h.Client().PostAsync($"/api/menus/r/{token}/views/{view}", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _h.Client().PostAsync($"/api/menus/r/{token}/views/wrong", null)).StatusCode);
        RestaurantOperationsDto data = (await client.GetFromJsonAsync<RestaurantOperationsDto>(Root(id)))!;
        Assert.Equal(1, Assert.Single(data.Dishes).Views);
        await _h.InDbAsync(async db => { (await db.Menus.SingleAsync(m => m.RestaurantId == id)).IsPublished = false; await db.SaveChangesAsync(); });
        Assert.Equal(HttpStatusCode.NotFound, (await _h.Client().PostAsync($"/api/menus/r/{token}/views/{view}", null)).StatusCode);
        Assert.Equal(1, await _h.InDbAsync(db => db.MenuItems.Where(i => i.Category!.Menu!.RestaurantId == id).SumAsync(i => i.QrViews)));
    }
}
