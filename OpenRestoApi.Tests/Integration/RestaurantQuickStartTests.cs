using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Integration;

public sealed class RestaurantQuickStartTests(TestWebAppFactory factory) : IClassFixture<TestWebAppFactory>, IDisposable
{
    private readonly PlatformHarness _h = new(factory);
    public void Dispose() => _h.Dispose();

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
            await _h.InDbAsync(async db => {
                db.Bookings.Add(new Booking { RestaurantId = id, BookingRef = "EXAMPLE-X3", Date = DateTime.UtcNow.AddDays(1), Seats = 2,
                    CustomerName = "Client Exemple", CustomerEmail = "client@example.test", IsCancelled = true });
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
