using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;
using OpenRestoApi.Infrastructure.Persistence;
using OpenRestoApi.Infrastructure.Persistence.Repositories;

namespace OpenRestoApi.Tests.Infrastructure;

/// <summary>
/// Real SQLite rather than the in-memory provider: the retention pass uses
/// <c>ExecuteDeleteAsync</c>, which the in-memory provider cannot translate.
/// </summary>
public class AdminAuditRepositoryTests : IDisposable
{
    private readonly SqliteConnection _connection;

    public AdminAuditRepositoryTests()
    {
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();
    }

    public void Dispose()
    {
        _connection.Dispose();
        GC.SuppressFinalize(this);
    }

    private AppDbContext CreateContext()
    {
        DbContextOptions<AppDbContext> options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_connection)
            .Options;
        var db = new AppDbContext(options);
        db.Database.EnsureCreated();
        return db;
    }

    private static AdminAuditEntry Entry(
        string action,
        DateTime occurredAt,
        int? actorUserId = null,
        string? targetType = null,
        int? restaurantId = null) => new()
        {
            OccurredAt = occurredAt,
            ActorUserId = actorUserId,
            ActorEmail = "admin@test.com",
            ActorRole = UserRoles.Owner,
            Action = action,
            TargetType = targetType,
            RestaurantId = restaurantId,
            HttpMethod = "POST",
            Path = "/api/admin/test",
            StatusCode = 204,
        };

    private static readonly DateTime Noon = new(2026, 8, 17, 12, 0, 0, DateTimeKind.Utc);

    [Fact]
    public async Task QueryPagedAsync_ReturnsNewestFirst()
    {
        using AppDbContext db = CreateContext();
        var repo = new AdminAuditRepository(db);

        await repo.AddAsync(Entry(AuditActions.BookingCreate, Noon.AddHours(-2)));
        await repo.AddAsync(Entry(AuditActions.BookingCancel, Noon));
        await repo.AddAsync(Entry(AuditActions.BookingUpdate, Noon.AddHours(-1)));

        (List<AdminAuditEntry> items, int total) = await repo.QueryPagedAsync(new AuditQuery(), 1, 10);

        Assert.Equal(3, total);
        Assert.Equal(
            [AuditActions.BookingCancel, AuditActions.BookingUpdate, AuditActions.BookingCreate],
            items.Select(i => i.Action));
    }

    /// <summary>
    /// Entries written inside the same clock tick would otherwise page non-deterministically,
    /// dropping or repeating rows across a page boundary.
    /// </summary>
    [Fact]
    public async Task QueryPagedAsync_PagesDeterministically_WhenTimestampsCollide()
    {
        using AppDbContext db = CreateContext();
        var repo = new AdminAuditRepository(db);

        for (int i = 0; i < 6; i++)
        {
            await repo.AddAsync(Entry(AuditActions.BookingCreate, Noon));
        }

        (List<AdminAuditEntry> firstPage, _) = await repo.QueryPagedAsync(new AuditQuery(), 1, 3);
        (List<AdminAuditEntry> secondPage, _) = await repo.QueryPagedAsync(new AuditQuery(), 2, 3);

        Assert.Equal([6, 5, 4], firstPage.Select(e => e.Id));
        Assert.Equal([3, 2, 1], secondPage.Select(e => e.Id));
    }

    [Fact]
    public async Task QueryPagedAsync_MatchesActionByPrefix()
    {
        using AppDbContext db = CreateContext();
        var repo = new AdminAuditRepository(db);

        await repo.AddAsync(Entry(AuditActions.BookingCancel, Noon));
        await repo.AddAsync(Entry(AuditActions.BookingCreate, Noon));
        await repo.AddAsync(Entry(AuditActions.UserRoleChange, Noon));

        (List<AdminAuditEntry> group, _) = await repo.QueryPagedAsync(new AuditQuery { Action = "booking" }, 1, 10);
        (List<AdminAuditEntry> exact, _) = await repo.QueryPagedAsync(
            new AuditQuery { Action = AuditActions.BookingCancel }, 1, 10);

        Assert.Equal(2, group.Count);
        Assert.Single(exact);
    }

    /// <summary>
    /// Two real accounts, because <c>ActorUserId</c> is a real foreign key — filtering by actor
    /// against ids that reference nothing would prove less than it looks.
    /// </summary>
    private static async Task<(int First, int Second)> SeedActorsAsync(AppDbContext db)
    {
        var first = new AdminCredential { Email = "one@test.com", PasswordHash = "h", PasswordSalt = "s" };
        var second = new AdminCredential { Email = "two@test.com", PasswordHash = "h", PasswordSalt = "s" };
        db.AdminCredentials.AddRange(first, second);
        await db.SaveChangesAsync();
        return (first.Id, second.Id);
    }

    [Fact]
    public async Task QueryPagedAsync_FiltersByActorTargetAndRestaurant()
    {
        using AppDbContext db = CreateContext();
        var repo = new AdminAuditRepository(db);
        (int first, int second) = await SeedActorsAsync(db);

        await repo.AddAsync(Entry(AuditActions.BookingCancel, Noon, actorUserId: first, targetType: AuditTargets.Booking, restaurantId: 5));
        await repo.AddAsync(Entry(AuditActions.BookingCancel, Noon, actorUserId: second, targetType: AuditTargets.Booking, restaurantId: 5));
        await repo.AddAsync(Entry(AuditActions.BrandUpdate, Noon, actorUserId: first, targetType: AuditTargets.Brand));

        (_, int byActor) = await repo.QueryPagedAsync(new AuditQuery { ActorUserId = first }, 1, 10);
        (_, int byTarget) = await repo.QueryPagedAsync(new AuditQuery { TargetType = AuditTargets.Booking }, 1, 10);
        (_, int byRestaurant) = await repo.QueryPagedAsync(new AuditQuery { RestaurantId = 5 }, 1, 10);

        Assert.Equal(2, byActor);
        Assert.Equal(2, byTarget);
        Assert.Equal(2, byRestaurant);
    }

    [Fact]
    public async Task QueryPagedAsync_FiltersByDateRangeInclusively()
    {
        using AppDbContext db = CreateContext();
        var repo = new AdminAuditRepository(db);

        await repo.AddAsync(Entry(AuditActions.BookingCancel, Noon.AddDays(-2)));
        await repo.AddAsync(Entry(AuditActions.BookingCancel, Noon));
        await repo.AddAsync(Entry(AuditActions.BookingCancel, Noon.AddDays(2)));

        (_, int inRange) = await repo.QueryPagedAsync(
            new AuditQuery { From = Noon.AddDays(-1), To = Noon.AddDays(1) }, 1, 10);

        Assert.Equal(1, inRange);
    }

    private static AdminAuditEntry ReadEntry(DateTime at, int actorUserId, string label, int? restaurantId) => new()
    {
        OccurredAt = at,
        ActorUserId = actorUserId,
        ActorEmail = "admin@test.com",
        ActorRole = UserRoles.Owner,
        Action = AuditActions.GuestDataRead,
        TargetLabel = label,
        RestaurantId = restaurantId,
        HttpMethod = "GET",
        Path = "/api/admin/bookings",
        StatusCode = 200,
    };

    /// <summary>Two accounts and two consecutive locations, so a foreign key never refuses a row.</summary>
    private static async Task<(int Actor, int OtherActor, int Location, int OtherLocation)> SeedActorsAndLocationsAsync(AppDbContext db)
    {
        var first = new AdminCredential { Email = "reader-one@test.com", PasswordHash = "h", PasswordSalt = "s" };
        var second = new AdminCredential { Email = "reader-two@test.com", PasswordHash = "h", PasswordSalt = "s" };
        var oneLocation = new Restaurant { Name = "Audit One" };
        var otherLocation = new Restaurant { Name = "Audit Two" };
        db.AdminCredentials.AddRange(first, second);
        db.Restaurants.AddRange(oneLocation, otherLocation);
        await db.SaveChangesAsync();
        return (first.Id, second.Id, oneLocation.Id, otherLocation.Id);
    }

    /// <summary>
    /// A repeated read of guest data is one row only for the same person, screen and location,
    /// and only from the moment it falls inside the window. Each axis is pinned on its own.
    /// </summary>
    [Theory]
    [InlineData(7, "Bookings", 3, 100, true)]
    [InlineData(7, "Bookings", 3, 99, false)]
    [InlineData(8, "Bookings", 3, 100, false)]
    [InlineData(7, "Waitlist", 3, 100, false)]
    [InlineData(7, "Bookings", 4, 100, false)]
    public async Task ExistsSinceAsync_MatchesOnlyTheSamePersonScreenLocationAndWindow(
        int actor, string label, int restaurantId, int windowStartsSecondsBeforeNoon, bool expected)
    {
        using AppDbContext db = CreateContext();
        var repo = new AdminAuditRepository(db);
        (int firstActor, _, int firstLocation, _) = await SeedActorsAndLocationsAsync(db);
        DateTime readAt = Noon.AddSeconds(-100);
        await repo.AddAsync(ReadEntry(readAt, firstActor, "Bookings", firstLocation));

        // The theory's 7/8 and 3/4 stand for "the same one" and "another one".
        int askingActor = actor == 7 ? firstActor : firstActor + 1;
        int askingLocation = restaurantId == 3 ? firstLocation : firstLocation + 1;
        bool found = await repo.ExistsSinceAsync(
            askingActor, "admin@test.com", null, AuditActions.GuestDataRead, label, askingLocation,
            Noon.AddSeconds(-windowStartsSecondsBeforeNoon));

        Assert.Equal(expected, found);
    }

    /// <summary>
    /// The same account reading through an API key is a different "who" than its browser session:
    /// the key's name rides on the display name, and the read must not be absorbed by the earlier row.
    /// </summary>
    [Theory]
    [InlineData(null, true)]
    [InlineData("Casey", false)]
    [InlineData("Casey (API key \"reports\")", false)]
    public async Task ExistsSinceAsync_DoesNotMatchAnotherCredentialOfTheSameAccount(string? askingDisplayName, bool expected)
    {
        using AppDbContext db = CreateContext();
        var repo = new AdminAuditRepository(db);
        (int actor, _, int location, _) = await SeedActorsAndLocationsAsync(db);
        await repo.AddAsync(ReadEntry(Noon, actor, "Bookings", location));

        bool found = await repo.ExistsSinceAsync(
            actor, "admin@test.com", askingDisplayName, AuditActions.GuestDataRead, "Bookings", location, Noon.AddMinutes(-1));

        Assert.Equal(expected, found);
    }

    [Fact]
    public async Task ExistsSinceAsync_MatchesTheSameApiKey_AndNotAnother()
    {
        using AppDbContext db = CreateContext();
        var repo = new AdminAuditRepository(db);
        (int actor, _, int location, _) = await SeedActorsAndLocationsAsync(db);
        AdminAuditEntry viaKey = ReadEntry(Noon, actor, "Bookings", location);
        viaKey.ActorDisplayName = "Casey (API key \"reports\")";
        await repo.AddAsync(viaKey);

        Assert.True(await repo.ExistsSinceAsync(
            actor, "admin@test.com", "Casey (API key \"reports\")", AuditActions.GuestDataRead, "Bookings", location, Noon.AddMinutes(-1)));
        Assert.False(await repo.ExistsSinceAsync(
            actor, "admin@test.com", "Casey (API key \"other\")", AuditActions.GuestDataRead, "Bookings", location, Noon.AddMinutes(-1)));
    }

    [Fact]
    public async Task ExistsSinceAsync_MatchesAnActorWithNoIdByEmail()
    {
        using AppDbContext db = CreateContext();
        var repo = new AdminAuditRepository(db);
        AdminAuditEntry legacy = ReadEntry(Noon, actorUserId: 0, "Bookings", restaurantId: null);
        legacy.ActorUserId = null;
        await repo.AddAsync(legacy);

        Assert.True(await repo.ExistsSinceAsync(
            null, "admin@test.com", null, AuditActions.GuestDataRead, "Bookings", null, Noon.AddMinutes(-1)));
        Assert.False(await repo.ExistsSinceAsync(
            null, "someone-else@test.com", null, AuditActions.GuestDataRead, "Bookings", null, Noon.AddMinutes(-1)));
    }

    [Fact]
    public async Task DeleteOlderThanAsync_RemovesOnlyEntriesBeforeTheCutoff()
    {
        using AppDbContext db = CreateContext();
        var repo = new AdminAuditRepository(db);

        await repo.AddAsync(Entry(AuditActions.BookingCancel, Noon.AddDays(-400)));
        await repo.AddAsync(Entry(AuditActions.BookingCancel, Noon.AddDays(-10)));

        int removed = await repo.DeleteOlderThanAsync(Noon.AddDays(-365));

        (_, int remaining) = await repo.QueryPagedAsync(new AuditQuery(), 1, 10);
        Assert.Equal(1, removed);
        Assert.Equal(1, remaining);
    }
}
