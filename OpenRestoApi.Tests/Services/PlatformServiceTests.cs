using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Application.Services;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;
using OpenRestoApi.Tests.Integration;
using OpenRestoApi.Tests.TestInfrastructure;
using static OpenRestoApi.Tests.Integration.PlatformHarness;

namespace OpenRestoApi.Tests.Services;

/// <summary>
/// The platform's own rules, on the real service over a real database. The audit scope is read
/// back from the same scope the service wrote to, so what these tests assert is what the audit
/// middleware would store.
/// </summary>
public sealed class PlatformServiceTests(TestWebAppFactory factory) : IClassFixture<TestWebAppFactory>, IDisposable
{
    private readonly PlatformHarness _h = new(factory);

    public void Dispose() => _h.Dispose();

    private async Task<T> AsOperatorAsync<T>(Func<PlatformService, AuditScope, Task<T>> action)
    {
        using IServiceScope scope = _h.App.Services.CreateScope();
        AdminCredential owner = await _h.InDbAsync(db => db.AdminCredentials.OrderBy(c => c.Id).FirstAsync());
        var service = ActivatorUtilities.CreateInstance<PlatformService>(scope.ServiceProvider, FakeCurrentUser.For(owner));
        return await action(service, scope.ServiceProvider.GetRequiredService<AuditScope>());
    }

    private async Task<int> PublishedRestaurantAsync(string name, Action<Restaurant>? change = null)
        => await _h.InDbAsync(async db =>
        {
            var restaurant = new Restaurant { Name = name, Timezone = "Europe/Brussels", PublishedAt = DateTime.UtcNow };
            change?.Invoke(restaurant);
            db.Restaurants.Add(restaurant);
            await db.SaveChangesAsync();
            return restaurant.Id;
        });

    // ── The list ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task List_CarriesCountsAndDates_AndNoGuestField()
    {
        int id = await PublishedRestaurantAsync("Liste Complète", r =>
        {
            r.OnboardingSteps = "info:done,hours:done,menu:skipped";
            r.SuspensionReason = null;
        });
        await _h.InDbAsync(async db =>
        {
            db.Bookings.AddRange(
                new Booking { RestaurantId = id, Date = DateTime.UtcNow.AddDays(1), Seats = 2, CustomerName = "A", CustomerEmail = "a@x.example", BookingRef = "PL1" + Guid.NewGuid().ToString("N")[..6] },
                new Booking { RestaurantId = id, Date = DateTime.UtcNow.AddDays(-1), Seats = 2, CustomerName = "B", CustomerEmail = "b@x.example", BookingRef = "PL2" + Guid.NewGuid().ToString("N")[..6] },
                new Booking { RestaurantId = id, Date = DateTime.UtcNow.AddDays(2), Seats = 2, IsCancelled = true, BookingRef = "PL3" + Guid.NewGuid().ToString("N")[..6] });
            await db.SaveChangesAsync();
        });

        PlatformRestaurantDto row = (await AsOperatorAsync((s, _) => s.GetRestaurantsAsync())).Single(r => r.Id == id);

        Assert.Equal("Published", row.Status);
        Assert.NotNull(row.PublishedAt);
        Assert.Equal(2, row.TotalBookings);
        Assert.Equal(1, row.UpcomingBookings);
        Assert.Equal(3, row.StepsDone);
        Assert.Equal(5, row.StepsTotal);
        Assert.Equal("layout", row.NextStep);
        Assert.Null(row.Invitation);
        Assert.Null(row.OwnerEmail);
    }

    [Fact]
    public async Task List_ShowsEachRestaurantsRetention_AndNullForOneWithNoPeriodYet()
    {
        int none = await PublishedRestaurantAsync("Sans Durée", r => r.BookingRetentionMonths = null);
        int six = await PublishedRestaurantAsync("Six Mois", r => r.BookingRetentionMonths = 6);

        List<PlatformRestaurantDto> rows = await AsOperatorAsync((s, _) => s.GetRestaurantsAsync());

        Assert.Null(rows.Single(r => r.Id == none).BookingRetentionMonths);
        Assert.Equal(6, rows.Single(r => r.Id == six).BookingRetentionMonths);
    }

    [Fact]
    public async Task List_NeverListsAnArchivedRestaurant()
    {
        int id = await PublishedRestaurantAsync("Archivé Discret", r => r.IsArchived = true);

        Assert.DoesNotContain(await AsOperatorAsync((s, _) => s.GetRestaurantsAsync()), r => r.Id == id);
    }

    [Fact]
    public void TheListRowAndTheInvitationCarryNoGuestField()
    {
        string[] allowed =
        [
            nameof(PlatformRestaurantDto.Id), nameof(PlatformRestaurantDto.Name), nameof(PlatformRestaurantDto.Status),
            nameof(PlatformRestaurantDto.PublishedAt), nameof(PlatformRestaurantDto.SuspendedAt), nameof(PlatformRestaurantDto.SuspensionReason),
            nameof(PlatformRestaurantDto.OwnerEmail), nameof(PlatformRestaurantDto.Invitation), nameof(PlatformRestaurantDto.LastLoginAt),
            nameof(PlatformRestaurantDto.TotalBookings), nameof(PlatformRestaurantDto.UpcomingBookings), nameof(PlatformRestaurantDto.StepsDone),
            nameof(PlatformRestaurantDto.StepsTotal), nameof(PlatformRestaurantDto.NextStep), nameof(PlatformRestaurantDto.BookingRetentionMonths),
        ];

        Assert.Equal(allowed.Order(), typeof(PlatformRestaurantDto).GetProperties().Select(p => p.Name).Order());
        Assert.Equal(["CreatedAt", "Email", "ExpiresAt", "State"], typeof(PlatformInvitationDto).GetProperties().Select(p => p.Name).Order());
    }

    // ── Guest data ───────────────────────────────────────────────────────────

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("123456789")]
    public async Task AccessGuestData_RefusesAMissingOrShortReason_AndReadsNothing(string reason)
    {
        int id = await PublishedRestaurantAsync("Garde Ses Clients");

        (AuditScope audit, ValidationException refused) = await AsOperatorAsync(async (s, a) =>
            (a, await Assert.ThrowsAsync<ValidationException>(() => s.AccessGuestDataAsync(id, new GuestDataAccessRequest { Reason = reason }))));

        Assert.Equal(ErrorCodes.PlatformAccessReasonRequired, refused.Code);
        Assert.False(audit.IsDescribed);
    }

    [Fact]
    public async Task AccessGuestData_RefusesAReasonBeyondThreeHundredCharacters_AndAcceptsExactlyThreeHundred()
    {
        int id = await PublishedRestaurantAsync("Motif Limite");

        ValidationException tooLong = await AsOperatorAsync((s, _) =>
            Assert.ThrowsAsync<ValidationException>(() => s.AccessGuestDataAsync(id, new GuestDataAccessRequest { Reason = new string('x', 301) })));
        GuestDataAccessDto edge = await AsOperatorAsync((s, _) => s.AccessGuestDataAsync(id, new GuestDataAccessRequest { Reason = new string('x', 300) }));
        GuestDataAccessDto minimum = await AsOperatorAsync((s, _) => s.AccessGuestDataAsync(id, new GuestDataAccessRequest { Reason = new string('y', 10) }));

        Assert.Equal(ErrorCodes.PlatformAccessReasonRequired, tooLong.Code);
        Assert.Equal(id, edge.RestaurantId);
        Assert.Equal(id, minimum.RestaurantId);
    }

    [Fact]
    public async Task AccessGuestData_ReturnsTheGuests_AndRecordsTheReason()
    {
        int id = await PublishedRestaurantAsync("Avec Raison");
        await _h.InDbAsync(async db =>
        {
            db.Bookings.AddRange(
                new Booking { RestaurantId = id, Date = DateTime.UtcNow.AddDays(1), Seats = 3, CustomerName = "Inès", CustomerEmail = "ines@x.example", SpecialRequests = "poussette", BookingRef = "AG1" + Guid.NewGuid().ToString("N")[..6] },
                new Booking { RestaurantId = id, Date = DateTime.UtcNow.AddDays(-400), Seats = 2, AnonymizedAt = DateTime.UtcNow, BookingRef = "AG2" + Guid.NewGuid().ToString("N")[..6] });
            await db.SaveChangesAsync();
        });

        (GuestDataAccessDto granted, AuditScope audit) = await AsOperatorAsync(async (s, a) =>
            (await s.AccessGuestDataAsync(id, new GuestDataAccessRequest { Reason = "  Ticket 77 : export demandé  " }), a));

        Assert.Equal(2, granted.Bookings.Count);
        PlatformGuestBookingDto named = granted.Bookings.Single(b => !b.IsAnonymized);
        Assert.Equal("Inès", named.CustomerName);
        Assert.Equal("poussette", named.SpecialRequests);
        PlatformGuestBookingDto gone = granted.Bookings.Single(b => b.IsAnonymized);
        Assert.Null(gone.CustomerName);
        Assert.Null(gone.CustomerEmail);

        Assert.True(audit.IsDescribed);
        Assert.Equal(AuditActions.PlatformGuestDataAccess, audit.Action);
        Assert.Equal(id, audit.RestaurantId);
        Assert.Contains("Ticket 77 : export demandé", audit.Summary);
        Assert.DoesNotContain("Inès", audit.Summary + audit.TargetLabel);
        Assert.DoesNotContain("ines@x.example", audit.Summary + audit.TargetLabel);
    }

    [Fact]
    public async Task AccessGuestData_ReadsOnlyTheMostRecentTwoHundredBookings()
    {
        int id = await PublishedRestaurantAsync("Beaucoup De Monde");
        await _h.InDbAsync(async db =>
        {
            for (int i = 0; i < 205; i++)
            {
                db.Bookings.Add(new Booking { RestaurantId = id, Date = DateTime.UtcNow.AddHours(-i), Seats = 2, BookingRef = $"BIG{i:D4}{Guid.NewGuid().ToString("N")[..4]}" });
            }

            await db.SaveChangesAsync();
        });

        GuestDataAccessDto granted = await AsOperatorAsync((s, _) => s.AccessGuestDataAsync(id, new GuestDataAccessRequest { Reason = "Ticket 9 : volume important" }));

        Assert.Equal(PlatformService.GuestDataLimit, granted.Bookings.Count);
        Assert.Equal(205, granted.TotalBookings);
        Assert.True(granted.Bookings.Zip(granted.Bookings.Skip(1)).All(p => p.First.Date >= p.Second.Date));
    }

    // ── Invitations ──────────────────────────────────────────────────────────

    [Fact]
    public async Task SendInvitation_ToAMemberRestaurant_ReusesTheAccountAddress()
    {
        (int id, _) = await _h.RunningRestaurantAsync();
        string email = (await _h.InDbAsync(db => db.RestaurantInvitations.FirstAsync(i => i.RestaurantId == id))).Email;

        PlatformInvitationResultDto again = await AsOperatorAsync((s, _) => s.SendInvitationAsync(id, new SendInvitationRequest()));

        Assert.Equal(email, again.Restaurant.Invitation!.Email);
        Assert.Equal("Pending", again.Restaurant.Invitation.State);
    }

    [Fact]
    public async Task SendInvitation_ToANewAddress_RefusesOneThatBelongsToAnotherAccount()
    {
        Invited invited = await _h.InviteAsync();

        BusinessRuleException refused = await AsOperatorAsync((s, _) => Assert.ThrowsAsync<BusinessRuleException>(
            () => s.SendInvitationAsync(invited.RestaurantId, new SendInvitationRequest { Email = TestWebAppFactory.AdminEmail })));

        Assert.Equal(ErrorCodes.UserEmailAlreadyExists, refused.Code);
        Assert.Equal(1, await _h.InDbAsync(db => db.RestaurantInvitations.CountAsync(i => i.RestaurantId == invited.RestaurantId && i.RevokedAt == null)));
    }

    [Fact]
    public async Task EveryOperationOnAnUnknownOrArchivedRestaurant_IsANotFound()
    {
        int archived = await PublishedRestaurantAsync("Archivé", r => r.IsArchived = true);
        foreach (int id in new[] { 987654, archived })
        {
            var operations = new Func<PlatformService, Task>[]
            {
                s => s.SendInvitationAsync(id, new SendInvitationRequest { Email = "x@y.example" }),
                s => s.SuspendAsync(id, new SuspendRestaurantRequest()),
                s => s.ReactivateAsync(id),
                s => s.SetRetentionAsync(id, new SetRetentionRequest { Months = 6 }),
                s => s.AccessGuestDataAsync(id, new GuestDataAccessRequest { Reason = "Ticket 1 : valid reason" }),
                s => s.GetAcceptancesAsync(id),
            };

            foreach (Func<PlatformService, Task> operation in operations)
            {
                NotFoundException refused = await AsOperatorAsync((s, _) => Assert.ThrowsAsync<NotFoundException>(() => operation(s)));
                Assert.Equal(ErrorCodes.PlatformNotFound, refused.Code);
            }
        }

        Restaurant stored = await _h.InDbAsync(db => db.Restaurants.AsNoTracking().FirstAsync(r => r.Id == archived));
        Assert.Equal(RestaurantStatus.Published, stored.Status);
        Assert.Equal(BookingRetention.DefaultMonths, stored.BookingRetentionMonths);
    }

    // ── Retention ────────────────────────────────────────────────────────────

    private Task<int?> StoredRetentionAsync(int id)
        => _h.InDbAsync(db => db.Restaurants.AsNoTracking().Where(r => r.Id == id).Select(r => r.BookingRetentionMonths).FirstAsync());

    [Fact]
    public async Task SetRetention_FixesThePeriod_AndNullSwitchesTheErasureOff()
    {
        int id = await PublishedRestaurantAsync("Durée Fixée", r => r.BookingRetentionMonths = null);

        (PlatformRestaurantDto fixedTo6, AuditScope fixedAudit) = await AsOperatorAsync(async (s, a) =>
            (await s.SetRetentionAsync(id, new SetRetentionRequest { Months = 6 }), a));
        int? afterFix = await StoredRetentionAsync(id);
        PlatformRestaurantDto off = await AsOperatorAsync((s, _) => s.SetRetentionAsync(id, new SetRetentionRequest { Months = null }));

        Assert.Equal(6, fixedTo6.BookingRetentionMonths);
        Assert.Equal(6, afterFix);
        Assert.Null(off.BookingRetentionMonths);
        Assert.Null(await StoredRetentionAsync(id));

        Assert.Equal(AuditActions.PlatformRetentionSet, fixedAudit.Action);
        Assert.Equal(id, fixedAudit.RestaurantId);
        Assert.Contains("6", fixedAudit.Summary);
        Assert.Contains("bookingRetentionMonths", fixedAudit.ChangesJson());
    }

    [Theory]
    [InlineData(1)]
    [InlineData(60)]
    public async Task SetRetention_AcceptsBothEdgesOfTheRange(int months)
    {
        int id = await PublishedRestaurantAsync("Bornes Permises" + months);

        await AsOperatorAsync((s, _) => s.SetRetentionAsync(id, new SetRetentionRequest { Months = months }));

        Assert.Equal(months, await StoredRetentionAsync(id));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(61)]
    public async Task SetRetention_RefusesAPeriodOutsideTheBounds_AndWritesNothing(int months)
    {
        int id = await PublishedRestaurantAsync("Bornes Refusées" + months, r => r.BookingRetentionMonths = 18);

        (AuditScope audit, ValidationException refused) = await AsOperatorAsync(async (s, a) =>
            (a, await Assert.ThrowsAsync<ValidationException>(() => s.SetRetentionAsync(id, new SetRetentionRequest { Months = months }))));

        Assert.Equal(ErrorCodes.PlatformRetentionInvalid, refused.Code);
        Assert.Equal(18, await StoredRetentionAsync(id));
        Assert.False(audit.IsDescribed);
        Assert.Null(audit.ChangesJson());
    }

    [Fact]
    public async Task AccessGuestData_RefusesAnAbsentReason_WithItsCode()
    {
        int id = await PublishedRestaurantAsync("Sans Champ");

        ValidationException refused = await AsOperatorAsync((s, _) => Assert.ThrowsAsync<ValidationException>(
            () => s.AccessGuestDataAsync(id, new GuestDataAccessRequest { Reason = null })));

        Assert.Equal(ErrorCodes.PlatformAccessReasonRequired, refused.Code);
    }

    [Fact]
    public async Task Suspend_RefusesAReasonBeyondThreeHundredCharacters_AndStoresNothing()
    {
        int id = await PublishedRestaurantAsync("Motif Trop Long");

        ValidationException refused = await AsOperatorAsync((s, _) => Assert.ThrowsAsync<ValidationException>(
            () => s.SuspendAsync(id, new SuspendRestaurantRequest { Reason = new string('r', 301) })));

        Assert.Equal(ErrorCodes.PlatformSuspendReasonTooLong, refused.Code);
        Assert.Equal(RestaurantStatus.Published, (await _h.InDbAsync(db => db.Restaurants.AsNoTracking().FirstAsync(r => r.Id == id))).Status);
    }

    [Fact]
    public async Task Suspend_AndReactivate_AreDescribedForTheAuditTrail()
    {
        int id = await PublishedRestaurantAsync("Tracé");

        AuditScope suspend = await AsOperatorAsync(async (s, a) => { await s.SuspendAsync(id, new SuspendRestaurantRequest { Reason = "Contrôle" }); return a; });
        AuditScope reactivate = await AsOperatorAsync(async (s, a) => { await s.ReactivateAsync(id); return a; });

        Assert.Equal(AuditActions.PlatformSuspend, suspend.Action);
        Assert.Equal(AuditActions.PlatformReactivate, reactivate.Action);
        Assert.Equal(id, suspend.RestaurantId);
    }

    [Fact]
    public void ThePlatformServiceExposesNoWayToReadGuestsOtherThanTheAuditedOne()
    {
        string[] readers = [.. typeof(PlatformService).GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Where(m => m.ReturnType.GetGenericArguments().Any(t => typeof(GuestDataAccessDto).IsAssignableFrom(t) || t == typeof(PlatformGuestBookingDto)))
            .Select(m => m.Name)];

        Assert.Equal([nameof(PlatformService.AccessGuestDataAsync)], readers);
    }
}
