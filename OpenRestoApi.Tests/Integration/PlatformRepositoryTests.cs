using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Services;
using OpenRestoApi.Core.Domain;
using OpenRestoApi.Infrastructure.Persistence;
using OpenRestoApi.Infrastructure.Persistence.Repositories;

namespace OpenRestoApi.Tests.Integration;

/// <summary>
/// The retention pass against a real database: what loses its identity, what must not, and that
/// the SQL predicate agrees with <see cref="BookingRetention.IsExpired"/> at the instant it matters.
/// </summary>
public sealed class PlatformRepositoryTests(TestWebAppFactory factory) : IClassFixture<TestWebAppFactory>
{
    private static readonly DateTime Now = new(2027, 3, 1, 12, 0, 0, DateTimeKind.Utc);

    private sealed class FixedClock(DateTime now) : ISystemClock
    {
        public DateTime UtcNow { get; } = now;
    }

    private async Task<T> InDbAsync<T>(Func<AppDbContext, Task<T>> action)
    {
        using IServiceScope scope = factory.Services.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    private async Task<int> RestaurantAsync(int retentionMonths = 12)
        => await InDbAsync(async db =>
        {
            var restaurant = new Restaurant { Name = "Rétention " + Guid.NewGuid().ToString("N")[..6], BookingRetentionMonths = retentionMonths };
            db.Restaurants.Add(restaurant);
            await db.SaveChangesAsync();

            // A stored default stands in for a 0 on insert, so an out-of-bounds value can only be
            // put there by writing over the row, which is what a bad import or a hand edit would do.
            await db.Restaurants.Where(r => r.Id == restaurant.Id).ExecuteUpdateAsync(set => set.SetProperty(r => r.BookingRetentionMonths, retentionMonths));
            return restaurant.Id;
        });

    private async Task<Booking> BookingAsync(int restaurantId, DateTime start, DateTime? end, bool cancelled = false, string name = "Zoé Martin")
        => await InDbAsync(async db =>
        {
            var booking = new Booking
            {
                RestaurantId = restaurantId,
                Date = start,
                EndTime = end,
                Seats = 4,
                IsCancelled = cancelled,
                CustomerName = name,
                CustomerEmail = "zoe@example.com",
                SpecialRequests = "allergie aux noix",
                BookingRef = "RET" + Guid.NewGuid().ToString("N")[..8],
            };
            db.Bookings.Add(booking);
            await db.SaveChangesAsync();
            return booking;
        });

    private async Task<RetentionOutcome> RunAsync(int restaurantId, int months)
    {
        using IServiceScope scope = factory.Services.CreateScope();
        var repository = new PlatformRepository(scope.ServiceProvider.GetRequiredService<AppDbContext>());
        return await repository.AnonymizeBeforeAsync(restaurantId, BookingRetention.CutoffUtc(Now, months), Now);
    }

    private Task<Booking> ReloadAsync(int id) => InDbAsync(db => db.Bookings.AsNoTracking().FirstAsync(b => b.Id == id));

    [Fact]
    public async Task AnAnonymisedBooking_KeepsItsRowItsDateItsSizeAndItsTable_AndLosesTheGuest()
    {
        int restaurant = await RestaurantAsync();
        DateTime start = Now.AddMonths(-13);
        Booking old = await BookingAsync(restaurant, start, start.AddHours(1), cancelled: true);

        RetentionOutcome outcome = await RunAsync(restaurant, 12);

        Booking after = await ReloadAsync(old.Id);
        Assert.Equal(1, outcome.Bookings);
        Assert.Null(after.CustomerName);
        Assert.Null(after.CustomerEmail);
        Assert.Null(after.SpecialRequests);
        Assert.Equal(Now, after.AnonymizedAt);
        Assert.Equal(old.BookingRef, after.BookingRef);
        Assert.Equal(start, after.Date);
        Assert.Equal(4, after.Seats);
        Assert.True(after.IsCancelled);
    }

    [Fact]
    public async Task TheCutoffInstantItself_IsStillInsideTheRetention_AndOneSecondEarlierIsNot()
    {
        int restaurant = await RestaurantAsync();
        DateTime cutoff = BookingRetention.CutoffUtc(Now, 12);
        Booking atCutoff = await BookingAsync(restaurant, cutoff.AddHours(-1), cutoff);
        Booking justBefore = await BookingAsync(restaurant, cutoff.AddHours(-2), cutoff.AddSeconds(-1));

        await RunAsync(restaurant, 12);

        Booking kept = await ReloadAsync(atCutoff.Id);
        Booking dropped = await ReloadAsync(justBefore.Id);
        Assert.Equal("Zoé Martin", kept.CustomerName);
        Assert.Null(kept.AnonymizedAt);
        Assert.Null(dropped.CustomerName);
        Assert.NotNull(dropped.AnonymizedAt);

        Assert.False(BookingRetention.IsExpired(atCutoff, 12, Now));
        Assert.True(BookingRetention.IsExpired(justBefore, 12, Now));
    }

    [Fact]
    public async Task ABookingWithNoEndTime_IsMeasuredFromItsStart()
    {
        int restaurant = await RestaurantAsync();
        Booking old = await BookingAsync(restaurant, Now.AddMonths(-13), null);
        Booking recent = await BookingAsync(restaurant, Now.AddMonths(-11), null);

        await RunAsync(restaurant, 12);

        Assert.Null((await ReloadAsync(old.Id)).CustomerName);
        Assert.Equal("Zoé Martin", (await ReloadAsync(recent.Id)).CustomerName);
    }

    [Fact]
    public async Task AFutureBooking_AndOneThatStartedLongAgoButEndsRecently_AreNeverTouched()
    {
        int restaurant = await RestaurantAsync();
        Booking future = await BookingAsync(restaurant, Now.AddMonths(14), Now.AddMonths(14).AddHours(1));
        Booking lingering = await BookingAsync(restaurant, Now.AddMonths(-13), Now.AddMonths(-2));

        RetentionOutcome outcome = await RunAsync(restaurant, 12);

        Assert.Equal(0, outcome.Bookings);
        Assert.Equal("Zoé Martin", (await ReloadAsync(future.Id)).CustomerName);
        Assert.Equal("Zoé Martin", (await ReloadAsync(lingering.Id)).CustomerName);
    }

    [Fact]
    public async Task ASecondPass_FindsNothingLeftToAnonymise()
    {
        int restaurant = await RestaurantAsync();
        await BookingAsync(restaurant, Now.AddMonths(-20), Now.AddMonths(-20).AddHours(1));

        RetentionOutcome first = await RunAsync(restaurant, 12);
        RetentionOutcome second = await RunAsync(restaurant, 12);

        Assert.Equal(1, first.Bookings);
        Assert.Equal(0, second.Total);
    }

    [Fact]
    public async Task OnlyTheRestaurantsOwnBookingsAreTouched()
    {
        int mine = await RestaurantAsync();
        int other = await RestaurantAsync();
        Booking theirs = await BookingAsync(other, Now.AddMonths(-30), Now.AddMonths(-30).AddHours(1));

        await RunAsync(mine, 12);

        Assert.Equal("Zoé Martin", (await ReloadAsync(theirs.Id)).CustomerName);
    }

    [Fact]
    public async Task TheReminderDevicesAndFailedMailsOfAnAnonymisedBooking_AreRemoved_AndOnlyThose()
    {
        int restaurant = await RestaurantAsync();
        Booking old = await BookingAsync(restaurant, Now.AddMonths(-14), Now.AddMonths(-14).AddHours(1));
        Booking recent = await BookingAsync(restaurant, Now.AddMonths(-1), Now.AddMonths(-1).AddHours(1));
        await InDbAsync(async db =>
        {
            db.GuestPushSubscriptions.AddRange(
                new GuestPushSubscription { BookingId = old.Id, Channel = GuestPushChannels.Expo, Endpoint = "ExponentPushToken[old]", CreatedAt = Now },
                new GuestPushSubscription { BookingId = recent.Id, Channel = GuestPushChannels.Expo, Endpoint = "ExponentPushToken[recent]", CreatedAt = Now });
            db.EmailFailures.AddRange(
                new EmailFailure { BookingRef = old.BookingRef, RecipientEmail = "zoe@example.com", ErrorMessage = "x", AttemptedAt = Now },
                new EmailFailure { BookingRef = recent.BookingRef, RecipientEmail = "zoe@example.com", ErrorMessage = "x", AttemptedAt = Now });
            await db.SaveChangesAsync();
            return 0;
        });

        RetentionOutcome outcome = await RunAsync(restaurant, 12);

        Assert.Equal(1, outcome.PushSubscriptions);
        Assert.Equal(1, outcome.EmailFailures);
        Assert.False(await InDbAsync(db => db.GuestPushSubscriptions.AnyAsync(s => s.BookingId == old.Id)));
        Assert.True(await InDbAsync(db => db.GuestPushSubscriptions.AnyAsync(s => s.BookingId == recent.Id)));
        Assert.False(await InDbAsync(db => db.EmailFailures.AnyAsync(f => f.BookingRef == old.BookingRef)));
        Assert.True(await InDbAsync(db => db.EmailFailures.AnyAsync(f => f.BookingRef == recent.BookingRef)));
    }

    [Fact]
    public async Task ClosedWaitlistTickets_LoseTheirGuest_WhileALiveTicketKeepsIt()
    {
        int restaurant = await RestaurantAsync();
        (int oldId, int liveId, int recentId) = await InDbAsync(async db =>
        {
            WaitlistEntry Entry(DateTime? closed, WaitlistStatus status) => new()
            {
                RestaurantId = restaurant,
                Ref = Guid.NewGuid().ToString("N")[..16],
                Name = "Jules",
                Seats = 2,
                Email = "jules@example.com",
                Status = status,
                CreatedAt = Now.AddMonths(-14),
                ClosedAt = closed,
                PushChannel = GuestPushChannels.Expo,
                PushEndpoint = "ExponentPushToken[jules]",
            };
            WaitlistEntry old = Entry(Now.AddMonths(-13), WaitlistStatus.Seated);
            WaitlistEntry live = Entry(null, WaitlistStatus.Waiting);
            WaitlistEntry recent = Entry(Now.AddMonths(-1), WaitlistStatus.Left);
            db.WaitlistEntries.AddRange(old, live, recent);
            await db.SaveChangesAsync();
            return (old.Id, live.Id, recent.Id);
        });

        RetentionOutcome outcome = await RunAsync(restaurant, 12);

        Assert.Equal(1, outcome.WaitlistEntries);
        WaitlistEntry old2 = await InDbAsync(db => db.WaitlistEntries.AsNoTracking().FirstAsync(w => w.Id == oldId));
        Assert.Equal(string.Empty, old2.Name);
        Assert.Null(old2.Email);
        Assert.Null(old2.PushEndpoint);
        Assert.Equal(2, old2.Seats);
        Assert.Equal("Jules", (await InDbAsync(db => db.WaitlistEntries.AsNoTracking().FirstAsync(w => w.Id == liveId))).Name);
        Assert.Equal("Jules", (await InDbAsync(db => db.WaitlistEntries.AsNoTracking().FirstAsync(w => w.Id == recentId))).Name);
    }

    [Fact]
    public async Task EachRestaurantIsHeldToItsOwnPeriod_AndABadStoredPeriodIsPassedOver()
    {
        int short12 = await RestaurantAsync(12);
        int long24 = await RestaurantAsync(24);
        int broken = await RestaurantAsync(0);
        Booking a = await BookingAsync(short12, Now.AddMonths(-18), Now.AddMonths(-18).AddHours(1));
        Booking b = await BookingAsync(long24, Now.AddMonths(-18), Now.AddMonths(-18).AddHours(1));
        Booking c = await BookingAsync(broken, Now.AddMonths(-18), Now.AddMonths(-18).AddHours(1));

        using IServiceScope scope = factory.Services.CreateScope();
        var service = ActivatorUtilities.CreateInstance<BookingRetentionService>(scope.ServiceProvider, new FixedClock(Now));
        await service.RunAsync();

        Assert.Null((await ReloadAsync(a.Id)).CustomerName);
        Assert.Equal("Zoé Martin", (await ReloadAsync(b.Id)).CustomerName);
        Assert.Equal("Zoé Martin", (await ReloadAsync(c.Id)).CustomerName);
    }
}
