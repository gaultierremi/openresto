using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Integration;

public sealed class RestaurantQuickStartTests(TestWebAppFactory factory) : IClassFixture<TestWebAppFactory>, IDisposable
{
    private readonly PlatformHarness _h = new(factory);
    public void Dispose() => _h.Dispose();

    [Fact]
    public async Task InboxPollingWithinTenMinutes_LeavesOneAuditRow()
    {
        var (id, owner) = await _h.RunningRestaurantAsync();
        using (owner)
        {
            for (int poll = 0; poll < 12; poll++)
            {
                var response = await owner.GetAsync($"/api/onboarding/restaurants/{id}/inbox");
                Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            }
            var rows = await _h.InDbAsync(db => db.AdminAuditEntries.AsNoTracking()
                .Where(a => a.Action == "guests.read" && a.RestaurantId == id).ToListAsync());
            Assert.Single(rows);
        }
    }

    [Fact]
    public async Task ConditionalInboxPolling_LeavesOneAuditRow_AndReturnsChangesAfterTheWindow()
    {
        var clock = new InboxClock();
        using var h = new PlatformHarness(factory, builder => builder.ConfigureServices(services =>
            services.AddSingleton<ISystemClock>(clock)));
        var (id, owner) = await h.RunningRestaurantAsync();
        using (owner)
        {
            string path = $"/api/onboarding/restaurants/{id}/inbox";
            owner.DefaultRequestHeaders.Add("Origin", "http://localhost");
            var first = await owner.GetAsync(path);
            Assert.Equal(HttpStatusCode.OK, first.StatusCode);
            Assert.Equal("no-store", first.Headers.CacheControl!.ToString());
            Assert.Contains("ETag", first.Headers.GetValues("Access-Control-Expose-Headers").Single(), StringComparison.OrdinalIgnoreCase);
            string version = first.Headers.ETag!.ToString();
            owner.DefaultRequestHeaders.IfNoneMatch.ParseAdd(version);
            for (int poll = 0; poll < 41; poll++)
            {
                clock.UtcNow += TimeSpan.FromSeconds(15);
                var unchanged = await owner.GetAsync(path);
                Assert.Equal(HttpStatusCode.NotModified, unchanged.StatusCode);
                Assert.Equal("", await unchanged.Content.ReadAsStringAsync());
                Assert.Equal("no-store", unchanged.Headers.CacheControl!.ToString());
            }
            Assert.Equal(1, await h.InDbAsync(db => db.AdminAuditEntries.CountAsync(a =>
                a.Action == "guests.read" && a.RestaurantId == id)));
            owner.DefaultRequestHeaders.IfNoneMatch.Clear();
            owner.DefaultRequestHeaders.IfNoneMatch.ParseAdd($"W/{version}");
            Assert.Equal(HttpStatusCode.NotModified, (await owner.GetAsync(path)).StatusCode);

            await h.InDbAsync(async db =>
            {
                db.Bookings.Add(new Booking
                {
                    RestaurantId = id,
                    BookingRef = "EXAMPLE-POLL",
                    Date = clock.UtcNow.AddDays(1),
                    Seats = 2,
                    CustomerName = "Client Exemple",
                    CustomerEmail = "client@example.test"
                });
                await db.SaveChangesAsync();
            });
            var changed = await owner.GetAsync(path);
            Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
            Assert.NotEqual(version, changed.Headers.ETag!.ToString());
            var inbox = await changed.Content.ReadFromJsonAsync<RestaurantInboxDto>();
            Assert.Equal("Client Exemple", Assert.Single(inbox!.Bookings).CustomerName);
            Assert.Equal(2, await h.InDbAsync(db => db.AdminAuditEntries.CountAsync(a =>
                a.Action == "guests.read" && a.RestaurantId == id)));

            var (foreignId, foreignOwner) = await h.RunningRestaurantAsync();
            using (foreignOwner)
            {
                foreignOwner.DefaultRequestHeaders.IfNoneMatch.ParseAdd(changed.Headers.ETag!.ToString());
                Assert.Equal(HttpStatusCode.NotFound, (await foreignOwner.GetAsync(path)).StatusCode);
                Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/onboarding/restaurants/{foreignId}/inbox")).StatusCode);
            }
        }
    }

    [Fact]
    public async Task ConditionalInboxPolling_UpdatesCancellationsAndAnonymization_WithoutReturningTheOldGuests()
    {
        var (id, owner) = await _h.RunningRestaurantAsync();
        using (owner)
        {
            int bookingId = await _h.InDbAsync(async db =>
            {
                var booking = new Booking
                {
                    RestaurantId = id,
                    BookingRef = "EXAMPLE-CHANGES",
                    Date = DateTime.UtcNow.AddDays(1),
                    Seats = 2,
                    CustomerName = "Client Exemple",
                    CustomerEmail = "client@example.test"
                };
                db.Bookings.Add(booking); await db.SaveChangesAsync(); return booking.Id;
            });
            string path = $"/api/onboarding/restaurants/{id}/inbox";
            var first = await owner.GetAsync(path);
            owner.DefaultRequestHeaders.IfNoneMatch.ParseAdd(first.Headers.ETag!.ToString());
            await _h.InDbAsync(async db =>
            {
                var booking = (await db.Bookings.FindAsync(bookingId))!;
                booking.IsCancelled = true; booking.CustomerName = null; booking.CustomerEmail = null;
                await db.SaveChangesAsync();
            });
            var updated = await owner.GetAsync(path);
            Assert.Equal(HttpStatusCode.OK, updated.StatusCode);
            var inbox = await updated.Content.ReadFromJsonAsync<RestaurantInboxDto>();
            var received = Assert.Single(inbox!.Bookings);
            Assert.True(received.IsCancelled); Assert.Null(received.CustomerName); Assert.Null(received.CustomerEmail);
        }
    }

    private sealed class InboxClock : ISystemClock
    {
        public DateTime UtcNow { get; set; } = DateTime.UtcNow;
    }

    [Fact]
    public async Task ProposalsNeverSave_AndForeignUnknownOrSuspendedImportsWriteNothing()
    {
        var (id, owner) = await _h.RunningRestaurantAsync();
        var (foreign, other) = await _h.RunningRestaurantAsync();
        using (owner)
        using (other)
        {
            int before = await _h.InDbAsync(db => db.MenuItems.CountAsync());
            foreach (string lang in new[] { "fr", "nl", "en" })
            {
                var response = await owner.PostAsJsonAsync($"/api/onboarding/restaurants/{id}/menu/import", new { text = "Soupe 8,50", language = lang });
                Assert.Equal(HttpStatusCode.OK, response.StatusCode);
                var proposal = await response.Content.ReadFromJsonAsync<SaveOnboardingMenuRequest>();
                Assert.Equal(lang, proposal!.Categories[0].Items[0].PrimaryLanguage);
                Assert.Equal(850, proposal.Categories[0].Items[0].PriceMinor);
            }
            foreach (int denied in new[] { foreign, int.MaxValue })
            {
                Assert.Equal(HttpStatusCode.NotFound, (await owner.PostAsJsonAsync($"/api/onboarding/restaurants/{denied}/menu/import", new { text = "Soupe 8", language = "fr" })).StatusCode);
                using var form = Photo("not an image");
                Assert.Equal(HttpStatusCode.NotFound, (await owner.PostAsync($"/api/onboarding/restaurants/{denied}/menu/import/photo", form)).StatusCode);
                Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/onboarding/restaurants/{denied}/inbox")).StatusCode);
            }
            using (var form = Photo("not an image"))
                Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsync($"/api/onboarding/restaurants/{id}/menu/import/photo", form)).StatusCode);
            Assert.Equal(HttpStatusCode.BadRequest, (await owner.PostAsJsonAsync($"/api/onboarding/restaurants/{id}/menu/import", new { text = "Soupe -8", language = "fr" })).StatusCode);
            await _h.InDbAsync(async db => { (await db.Restaurants.FindAsync(id))!.Status = RestaurantStatus.Suspended; await db.SaveChangesAsync(); return 0; });
            Assert.Equal(HttpStatusCode.Conflict, (await owner.PostAsJsonAsync($"/api/onboarding/restaurants/{id}/menu/import", new { text = "Soupe 8", language = "fr" })).StatusCode);
            Assert.Equal(before, await _h.InDbAsync(db => db.MenuItems.CountAsync()));
        }
    }

    [Fact]
    public async Task InboxIsPrivateNoStoreAndAudited_AndIncludesCancellations()
    {
        var (id, owner) = await _h.RunningRestaurantAsync();
        using (owner)
        {
            await _h.InDbAsync(async db =>
            {
                db.Bookings.Add(new Booking
                {
                    RestaurantId = id,
                    BookingRef = "EXAMPLE-X3",
                    Date = DateTime.UtcNow.AddDays(1),
                    Seats = 2,
                    CustomerName = "Client Exemple",
                    CustomerEmail = "client@example.test",
                    IsCancelled = true
                });
                await db.SaveChangesAsync(); return 0;
            });
            var response = await owner.GetAsync($"/api/onboarding/restaurants/{id}/inbox");
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal("no-store", response.Headers.CacheControl!.ToString());
            var inbox = await response.Content.ReadFromJsonAsync<RestaurantInboxDto>();
            Assert.Equal("Client Exemple", Assert.Single(inbox!.Bookings).CustomerName);
            Assert.True(inbox.Bookings[0].IsCancelled);
            Assert.True(await _h.InDbAsync(db => db.AdminAuditEntries.AnyAsync(a => a.Action == "guests.read" && a.RestaurantId == id)));
            using var anonymous = _h.Client();
            using var admin = _h.Operator();
            Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync($"/api/onboarding/restaurants/{id}/inbox")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await admin.GetAsync($"/api/onboarding/restaurants/{id}/inbox")).StatusCode);
            await _h.InDbAsync(async db => { (await db.Restaurants.FindAsync(id))!.IsArchived = true; await db.SaveChangesAsync(); return 0; });
            Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/onboarding/restaurants/{id}/inbox")).StatusCode);
        }
    }

    private static MultipartFormDataContent Photo(string text)
    {
        var form = new MultipartFormDataContent();
        var file = new ByteArrayContent(System.Text.Encoding.UTF8.GetBytes(text));
        file.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(file, "file", "menu.png"); form.Add(new StringContent("fr"), "language");
        return form;
    }
}
