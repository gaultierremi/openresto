using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;
using OpenRestoApi.Infrastructure.Auditing;
using OpenRestoApi.Infrastructure.Persistence;

namespace OpenRestoApi.Tests.Integration;

/// <summary>
/// A read that hands guest identity to an admin is a row in the trail: who, when, which screen
/// and which location, never what was read. Reads that hand over nothing stay unrecorded, and
/// repeated reads of the same screen by the same person form one row for
/// <c>AuditLogMiddleware.GuestDataReadWindow</c> (ten minutes), so the list stays readable.
/// </summary>
public class GuestDataReadAuditTests(TestWebAppFactory factory) : IClassFixture<TestWebAppFactory>
{
    private readonly TestWebAppFactory _factory = factory;

    private sealed record Seeded(int RestaurantId, int BookingId);

    private async Task<Seeded> SeedLocationWithABookingAsync(string name)
    {
        using IServiceScope scope = _factory.Services.CreateScope();
        AppDbContext db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var restaurant = new Restaurant
        {
            Name = name,
            OpenTime = "11:00",
            CloseTime = "23:00",
            Timezone = "UTC",
            Sections = [new() { Name = "Main", Tables = [new() { Name = "T1", Seats = 4 }] }],
        };
        db.Restaurants.Add(restaurant);
        await db.SaveChangesAsync();

        var booking = new Booking
        {
            RestaurantId = restaurant.Id,
            SectionId = restaurant.Sections.First().Id,
            TableId = restaurant.Sections.First().Tables.First().Id,
            Date = DateTime.UtcNow.AddDays(30),
            EndTime = DateTime.UtcNow.AddDays(30).AddHours(2),
            CustomerEmail = "marie.dupont@guest.example",
            CustomerName = "Marie Dupont",
            Seats = 2,
            BookingRef = Guid.NewGuid().ToString("N")[..8].ToUpperInvariant(),
        };
        db.Bookings.Add(booking);
        await db.SaveChangesAsync();
        return new Seeded(restaurant.Id, booking.Id);
    }

    private async Task<List<AdminAuditEntry>> ReadRowsAsync(int? restaurantId, string? label = null)
    {
        using IServiceScope scope = _factory.Services.CreateScope();
        AppDbContext db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        return await db.AdminAuditEntries.AsNoTracking()
            .Where(e => e.Action == AuditActions.GuestDataRead
                && e.RestaurantId == restaurantId
                && (label == null || e.TargetLabel == label))
            .OrderBy(e => e.Id)
            .ToListAsync();
    }

    private async Task AgeRowsAsync(int? restaurantId, TimeSpan by)
    {
        using IServiceScope scope = _factory.Services.CreateScope();
        AppDbContext db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        foreach (AdminAuditEntry row in await db.AdminAuditEntries
            .Where(e => e.Action == AuditActions.GuestDataRead && e.RestaurantId == restaurantId).ToListAsync())
        {
            row.OccurredAt -= by;
        }
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task ReadingGuestData_LandsOneRowNamingTheLocation()
    {
        Seeded seeded = await SeedLocationWithABookingAsync("Audit Read Bistro");
        HttpClient client = _factory.CreateAuthenticatedClient();

        HttpResponseMessage response = await client.GetAsync($"/api/admin/bookings?restaurantId={seeded.RestaurantId}");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AdminAuditEntry row = Assert.Single(await ReadRowsAsync(seeded.RestaurantId, "Bookings"));
        Assert.Equal(TestWebAppFactory.AdminEmail, row.ActorEmail);
        Assert.Equal(AuditTargets.GuestData, row.TargetType);
        Assert.Equal("GET", row.HttpMethod);
        Assert.Equal(200, row.StatusCode);
    }

    /// <summary>The row says that a screen was read, never what was on it.</summary>
    [Fact]
    public async Task TheRow_HoldsNoGuestIdentityAndNoQueryString()
    {
        Seeded seeded = await SeedLocationWithABookingAsync("Audit Quiet Bistro");
        HttpClient client = _factory.CreateAuthenticatedClient();

        await client.GetAsync($"/api/admin/bookings?restaurantId={seeded.RestaurantId}&email=marie.dupont@guest.example");

        AdminAuditEntry row = Assert.Single(await ReadRowsAsync(seeded.RestaurantId, "Bookings"));
        string everything = string.Join(' ', row.Path, row.Summary, row.TargetLabel, row.TargetId, row.ChangesJson);
        Assert.DoesNotContain("marie", everything, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("guest.example", everything, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("?", row.Path, StringComparison.Ordinal);
    }

    [Fact]
    public async Task EveryDeclaredRead_LandsARowForItsLocation()
    {
        Seeded seeded = await SeedLocationWithABookingAsync("Audit Every Bistro");
        HttpClient client = _factory.CreateAuthenticatedClient();
        int id = seeded.RestaurantId;

        (string Url, string Label)[] reads =
        [
            ($"/api/restaurants/{id}/bookings", "Bookings"),
            ($"/api/admin/restaurants/{id}/waitlist", "Waitlist"),
            ($"/api/restaurants/{id}/schedule-conflicts", "Schedule conflicts"),
            ($"/api/admin/notifications?restaurantId={id}", "Notifications"),
            ($"/api/admin/bookings/{seeded.BookingId}", "Booking"),
            ($"/api/bookings/{seeded.BookingId}", "Booking"),
        ];

        foreach ((string url, string label) in reads)
        {
            HttpResponseMessage response = await client.GetAsync(url);
            Assert.True(response.IsSuccessStatusCode, $"{url} answered {(int)response.StatusCode}");
            Assert.NotEmpty(await ReadRowsAsync(id, label));
        }
    }

    /// <summary>Reads that name no location are recorded as reads of every location.</summary>
    [Theory]
    [InlineData("/api/admin/overview", "Today's bookings")]
    [InlineData("/api/admin/email-settings/failures", "Email failures")]
    public async Task ARead_NamingNoLocation_LandsARowForAllLocations(string url, string label)
    {
        HttpClient client = _factory.CreateAuthenticatedClient();
        await AgeRowsAsync(restaurantId: null, TimeSpan.FromHours(1));
        int before = (await ReadRowsAsync(restaurantId: null, label)).Count;

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync(url)).StatusCode);

        List<AdminAuditEntry> rows = await ReadRowsAsync(restaurantId: null, label);
        Assert.Equal(before + 1, rows.Count);
        Assert.Null(rows.Last().RestaurantId);
        Assert.Contains("all locations", rows.Last().Summary, StringComparison.Ordinal);
    }

    [Fact]
    public async Task RepeatedReads_WithinTheWindow_LandOneRow()
    {
        Seeded seeded = await SeedLocationWithABookingAsync("Audit Poll Bistro");
        HttpClient client = _factory.CreateAuthenticatedClient();

        for (int i = 0; i < 3; i++)
        {
            await client.GetAsync($"/api/admin/notifications?restaurantId={seeded.RestaurantId}");
        }

        Assert.Single(await ReadRowsAsync(seeded.RestaurantId, "Notifications"));
    }

    /// <summary>Both sides of the window: inside it the row is reused, outside it a new one lands.</summary>
    [Theory]
    [InlineData(9, 1)]
    [InlineData(11, 2)]
    public async Task ARepeatedRead_ReusesTheRowOnlyInsideTheWindow(int minutesSinceTheFirstRead, int expectedRows)
    {
        Seeded seeded = await SeedLocationWithABookingAsync($"Audit Window Bistro {minutesSinceTheFirstRead}");
        HttpClient client = _factory.CreateAuthenticatedClient();
        await client.GetAsync($"/api/admin/restaurants/{seeded.RestaurantId}/waitlist");
        await AgeRowsAsync(seeded.RestaurantId, TimeSpan.FromMinutes(minutesSinceTheFirstRead));

        await client.GetAsync($"/api/admin/restaurants/{seeded.RestaurantId}/waitlist");

        Assert.Equal(expectedRows, (await ReadRowsAsync(seeded.RestaurantId, "Waitlist")).Count);
    }

    [Fact]
    public async Task AnotherPersonReadingTheSameScreen_LandsTheirOwnRow()
    {
        Seeded seeded = await SeedLocationWithABookingAsync("Audit Two Readers Bistro");
        HttpClient owner = _factory.CreateAuthenticatedClient();
        await owner.GetAsync($"/api/admin/bookings?restaurantId={seeded.RestaurantId}");

        AdminCredential manager = await SeedManagerAsync("reader-manager@test.example");
        HttpClient managerClient = _factory.CreateClientWithToken(
            TestWebAppFactory.GenerateJwt(manager.Id, manager.Email, manager.Role));
        Assert.Equal(HttpStatusCode.OK,
            (await managerClient.GetAsync($"/api/admin/bookings?restaurantId={seeded.RestaurantId}")).StatusCode);

        List<AdminAuditEntry> rows = await ReadRowsAsync(seeded.RestaurantId, "Bookings");
        Assert.Equal(2, rows.Count);
        Assert.Contains(rows, r => r.ActorEmail == "reader-manager@test.example" && r.ActorRole == UserRoles.Manager);
    }

    [Fact]
    public async Task ARefusedRead_LandsNoRow()
    {
        Seeded seeded = await SeedLocationWithABookingAsync("Audit Refused Bistro");

        HttpResponseMessage anonymous = await _factory.CreateClient()
            .GetAsync($"/api/admin/bookings?restaurantId={seeded.RestaurantId}");
        HttpResponseMessage unknownBooking = await _factory.CreateAuthenticatedClient()
            .GetAsync("/api/admin/bookings/2147483000");

        Assert.Equal(HttpStatusCode.Unauthorized, anonymous.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, unknownBooking.StatusCode);
        Assert.Empty(await ReadRowsAsync(seeded.RestaurantId));
    }

    /// <summary>A read that hands over no guest identity stays outside the trail.</summary>
    [Fact]
    public async Task ARead_ThatReturnsNoGuestIdentity_LandsNoRow()
    {
        HttpClient client = _factory.CreateAuthenticatedClient();
        using IServiceScope before = _factory.Services.CreateScope();
        int count = await before.ServiceProvider.GetRequiredService<AppDbContext>().AdminAuditEntries.CountAsync();

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/admin/restaurants")).StatusCode);

        using IServiceScope after = _factory.Services.CreateScope();
        Assert.Equal(count, await after.ServiceProvider.GetRequiredService<AppDbContext>().AdminAuditEntries.CountAsync());
    }

    private async Task<AdminCredential> SeedManagerAsync(string email)
    {
        using IServiceScope scope = _factory.Services.CreateScope();
        AppDbContext db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        AdminCredential? existing = await db.AdminCredentials.FirstOrDefaultAsync(c => c.Email == email);
        if (existing != null) return existing;

        var passwords = scope.ServiceProvider.GetRequiredService<OpenRestoApi.Core.Application.Interfaces.IPasswordService>();
        (string hash, string salt) = passwords.Hash("seeded-password");
        var manager = new AdminCredential
        {
            Email = email,
            PasswordHash = hash,
            PasswordSalt = salt,
            DisplayName = "Reader Manager",
            Role = UserRoles.Manager,
        };
        db.AdminCredentials.Add(manager);
        await db.SaveChangesAsync();
        return manager;
    }
}
