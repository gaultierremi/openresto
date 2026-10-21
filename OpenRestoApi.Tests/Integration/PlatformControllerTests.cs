using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;
using static OpenRestoApi.Tests.Integration.PlatformHarness;

namespace OpenRestoApi.Tests.Integration;

/// <summary>
/// The platform space through the real pipeline: who may open it, what an invitation does, how a
/// restaurant disappears from guests and comes back, and the one audited door to guest data.
/// </summary>
public sealed class PlatformControllerTests(TestWebAppFactory factory) : IClassFixture<TestWebAppFactory>, IDisposable
{
    private readonly PlatformHarness _h = new(factory);

    public void Dispose() => _h.Dispose();

    // ── Who may do what ──────────────────────────────────────────────────────

    [Fact]
    public async Task PlatformEndpoints_AreClosedToAnonymousManagersAndRestaurateurs()
    {
        (_, HttpClient restaurateur) = await _h.RunningRestaurantAsync();
        HttpClient manager = await _h.ManagerAsync();

        foreach ((HttpClient client, HttpStatusCode expected) in new[]
        {
            (_h.Client(), HttpStatusCode.Unauthorized),
            (manager, HttpStatusCode.Forbidden),
            (restaurateur, HttpStatusCode.Forbidden),
        })
        {
            Assert.Equal(expected, (await client.GetAsync("/api/platform/restaurants")).StatusCode);
            Assert.Equal(expected, (await client.PostAsJsonAsync("/api/platform/restaurants", new { name = "X", ownerEmail = "x@y.example" })).StatusCode);
            Assert.Equal(expected, (await client.PostAsJsonAsync("/api/platform/restaurants/1/suspend", new { })).StatusCode);
            Assert.Equal(expected, (await client.PutAsJsonAsync("/api/platform/restaurants/1/retention", new { months = 6 })).StatusCode);
            Assert.Equal(expected, (await client.PostAsJsonAsync("/api/platform/restaurants/1/guest-data-access", new { reason = "a long enough reason" })).StatusCode);
        }
    }

    [Fact]
    public async Task APlatformOperatorsApiKey_CannotReachThePlatformSpace()
    {
        HttpResponseMessage minted = await _h.Operator().PostAsJsonAsync("/api/admin/api-keys", new
        {
            name = $"platform-{Guid.NewGuid():N}",
            scopes = new[] { new { resource = "locations", access = "write" } },
        });
        minted.EnsureSuccessStatusCode();
        string secret = (await minted.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("secret").GetString()!;
        HttpClient key = _h.Client();
        key.DefaultRequestHeaders.Add("X-API-Key", secret);

        Assert.Equal(HttpStatusCode.Forbidden, (await key.GetAsync("/api/platform/restaurants")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await key.PutAsJsonAsync("/api/platform/restaurants/1/retention", new { months = 6 })).StatusCode);
    }

    [Fact]
    public async Task ARestaurateurToken_ReachesNoAdminEndpoint_AndAnAdminTokenNoRestaurateurOne()
    {
        (_, HttpClient restaurateur) = await _h.RunningRestaurantAsync();

        foreach (string path in new[] { "/api/admin/overview", "/api/admin/users", "/api/admin/restaurants", "/api/admin/audit" })
        {
            Assert.Equal(HttpStatusCode.Forbidden, (await restaurateur.GetAsync(path)).StatusCode);
        }

        Assert.Equal(HttpStatusCode.Forbidden, (await restaurateur.PostAsJsonAsync("/api/restaurants", new { name = "Mine" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _h.Operator().GetAsync("/api/onboarding/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await (await _h.ManagerAsync()).GetAsync("/api/onboarding/me")).StatusCode);
    }

    // ── Creating a restaurant and inviting its owner ─────────────────────────

    [Fact]
    public async Task CreateRestaurant_StartsADraft_AndSendsTheInvitationInTheChosenLanguage()
    {
        Invited dutch = await _h.InviteAsync(name: "Brasserie Vlaanderen", locale: "nl");
        Invited french = await _h.InviteAsync(name: "Brasserie Wallonie");

        Assert.Equal("Draft", dutch.Result.Restaurant.Status);
        Assert.True(dutch.Result.EmailSent);
        SentMail nl = _h.Mail.Sent.Single(m => m.To == dutch.Email);
        Assert.Contains("Uitnodiging", nl.Subject);
        Assert.Contains(dutch.Token, nl.Html);
        Assert.Contains("Invitation", _h.Mail.Sent.Single(m => m.To == french.Email).Subject);

        Restaurant stored = await _h.InDbAsync(db => db.Restaurants.FirstAsync(r => r.Id == dutch.RestaurantId));
        Assert.Equal(RestaurantStatus.Draft, stored.Status);
        Assert.Equal("Europe/Brussels", stored.Timezone);
        Assert.Equal(BookingRetention.DefaultMonths, stored.BookingRetentionMonths);
    }

    [Fact]
    public async Task TheInvitationToken_IsStoredOnlyAsAHash()
    {
        Invited invited = await _h.InviteAsync();

        RestaurantInvitation row = await _h.InDbAsync(db => db.RestaurantInvitations.FirstAsync(i => i.RestaurantId == invited.RestaurantId));

        Assert.NotEqual(invited.Token, row.TokenHash);
        Assert.Equal(InvitationToken.Hash(invited.Token), row.TokenHash);
        Assert.DoesNotContain(invited.Token, row.Email + row.TokenHash + row.Locale);
    }

    [Theory]
    [InlineData("", "owner@resto.example")]
    [InlineData("   ", "owner@resto.example")]
    [InlineData("Chez Moi", "not-an-email")]
    [InlineData("Chez Moi", "")]
    public async Task CreateRestaurant_RefusesABlankNameOrABadAddress_AndCreatesNothing(string name, string email)
    {
        int before = await _h.InDbAsync(db => db.Restaurants.CountAsync());

        HttpResponseMessage response = await _h.Operator().PostAsJsonAsync("/api/platform/restaurants", new { name, ownerEmail = email });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(before, await _h.InDbAsync(db => db.Restaurants.CountAsync()));
        Assert.Equal(0, await _h.InDbAsync(db => db.RestaurantInvitations.CountAsync(i => i.Email == email && email != "")));
    }

    [Fact]
    public async Task CreateRestaurant_RefusesAnAddressThatAlreadyHasAnAccount_AndCreatesNothing()
    {
        int before = await _h.InDbAsync(db => db.Restaurants.CountAsync());

        HttpResponseMessage response = await _h.Operator().PostAsJsonAsync("/api/platform/restaurants",
            new { name = "Doublon", ownerEmail = TestWebAppFactory.AdminEmail });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(ErrorCodes.UserEmailAlreadyExists, Code(await ErrorOf(response)));
        Assert.Equal(before, await _h.InDbAsync(db => db.Restaurants.CountAsync()));
    }

    [Fact]
    public async Task CreateRestaurant_StillReturnsTheLink_WhenTheMailCannotBeSent()
    {
        _h.Mail.Fail = true;
        try
        {
            Invited invited = await _h.InviteAsync();

            Assert.False(invited.Result.EmailSent);
            Assert.Contains("/onboarding/invitation/", invited.Result.InvitationUrl);
            Assert.DoesNotContain(_h.Mail.Sent, m => m.To == invited.Email);
        }
        finally
        {
            _h.Mail.Fail = false;
        }
    }

    [Fact]
    public async Task SendInvitation_RevokesThePreviousLink_AndTheNewOneWorks()
    {
        Invited first = await _h.InviteAsync();

        HttpResponseMessage resend = await _h.Operator().PostAsJsonAsync($"/api/platform/restaurants/{first.RestaurantId}/invitations", new { });
        resend.EnsureSuccessStatusCode();
        string newToken = TokenOf((await resend.Content.ReadFromJsonAsync<PlatformInvitationResultDto>(Json))!.InvitationUrl);

        Assert.Equal(HttpStatusCode.NotFound, (await _h.Client().GetAsync($"/api/onboarding/invitations/{first.Token}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await _h.Client().GetAsync($"/api/onboarding/invitations/{newToken}")).StatusCode);
    }

    [Fact]
    public async Task SendInvitation_ToAnUnknownRestaurant_IsANotFound()
        => Assert.Equal(HttpStatusCode.NotFound,
            (await _h.Operator().PostAsJsonAsync("/api/platform/restaurants/987654/invitations", new { })).StatusCode);

    // ── Guests never see a draft ─────────────────────────────────────────────

    [Fact]
    public async Task ADraftRestaurant_IsInvisibleAndUnbookable_ForGuests()
    {
        Invited invited = await _h.InviteAsync(name: "Brouillon Secret");
        HttpClient guest = _h.Client();

        string list = await (await guest.GetAsync("/api/restaurants")).Content.ReadAsStringAsync();
        Assert.DoesNotContain("Brouillon Secret", list);
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync($"/api/restaurants/{invited.RestaurantId}")).StatusCode);

        HttpResponseMessage booking = await guest.PostAsJsonAsync("/api/bookings", new
        {
            restaurantId = invited.RestaurantId,
            date = DateTime.UtcNow.AddDays(3),
            seats = 2,
            customerEmail = "guest@example.com",
            customerName = "Guest",
        });
        Assert.Equal(HttpStatusCode.NotFound, booking.StatusCode);
        Assert.Equal(0, await _h.InDbAsync(db => db.Bookings.CountAsync(b => b.RestaurantId == invited.RestaurantId)));
    }

    // ── Suspending and reactivating ──────────────────────────────────────────

    private async Task<int> PublishedRestaurantAsync(string name)
        => await _h.InDbAsync(async db =>
        {
            var restaurant = new Restaurant { Name = name, Timezone = "Europe/Brussels", PublishedAt = DateTime.UtcNow };
            var section = new Section { Name = "Salle", Restaurant = restaurant };
            db.AddRange(restaurant, section, new Table { Name = "T1", Seats = 4, Section = section });
            await db.SaveChangesAsync();
            return restaurant.Id;
        });

    [Fact]
    public async Task Suspend_HidesAPublishedRestaurantFromGuests_AndReactivateBringsItBack()
    {
        int id = await PublishedRestaurantAsync("Le Suspendu");
        HttpClient guest = _h.Client();
        Assert.Equal(HttpStatusCode.OK, (await guest.GetAsync($"/api/restaurants/{id}")).StatusCode);

        HttpResponseMessage suspended = await _h.Operator().PostAsJsonAsync($"/api/platform/restaurants/{id}/suspend", new { reason = "Mise à jour des informations légales" });
        suspended.EnsureSuccessStatusCode();
        PlatformRestaurantDto dto = (await suspended.Content.ReadFromJsonAsync<PlatformRestaurantDto>(Json))!;

        Assert.Equal("Suspended", dto.Status);
        Assert.Equal("Mise à jour des informations légales", dto.SuspensionReason);
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync($"/api/restaurants/{id}")).StatusCode);
        Assert.DoesNotContain("Le Suspendu", await (await guest.GetAsync("/api/restaurants")).Content.ReadAsStringAsync());

        HttpResponseMessage back = await _h.Operator().PostAsync($"/api/platform/restaurants/{id}/reactivate", null);
        back.EnsureSuccessStatusCode();

        Assert.Equal("Published", (await back.Content.ReadFromJsonAsync<PlatformRestaurantDto>(Json))!.Status);
        Assert.Equal(HttpStatusCode.OK, (await guest.GetAsync($"/api/restaurants/{id}")).StatusCode);
    }

    [Fact]
    public async Task Reactivate_ReturnsADraftToADraft_NotToTheWebsite()
    {
        Invited invited = await _h.InviteAsync();

        (await _h.Operator().PostAsJsonAsync($"/api/platform/restaurants/{invited.RestaurantId}/suspend", new { })).EnsureSuccessStatusCode();
        HttpResponseMessage back = await _h.Operator().PostAsync($"/api/platform/restaurants/{invited.RestaurantId}/reactivate", null);

        Assert.Equal("Draft", (await back.Content.ReadFromJsonAsync<PlatformRestaurantDto>(Json))!.Status);
        Assert.Equal(HttpStatusCode.NotFound, (await _h.Client().GetAsync($"/api/restaurants/{invited.RestaurantId}")).StatusCode);
    }

    [Fact]
    public async Task Suspend_TwiceAndReactivateWhenNotSuspended_AreRefused()
    {
        int id = await PublishedRestaurantAsync("Deux Fois");
        HttpClient op = _h.Operator();

        Assert.Equal(HttpStatusCode.BadRequest, (await op.PostAsync($"/api/platform/restaurants/{id}/reactivate", null)).StatusCode);
        (await op.PostAsJsonAsync($"/api/platform/restaurants/{id}/suspend", new { })).EnsureSuccessStatusCode();
        HttpResponseMessage twice = await op.PostAsJsonAsync($"/api/platform/restaurants/{id}/suspend", new { });

        Assert.Equal(HttpStatusCode.BadRequest, twice.StatusCode);
        Assert.Equal(ErrorCodes.PlatformAlreadySuspended, Code(await ErrorOf(twice)));
    }

    [Fact]
    public async Task Suspend_KeepsTheBookingsAlreadyTaken_AndTheirGuestsCanStillCancel()
    {
        int id = await PublishedRestaurantAsync("Garde Ses Clients");
        string bookingRef = await _h.InDbAsync(async db =>
        {
            var booking = new Booking
            {
                RestaurantId = id,
                Date = DateTime.UtcNow.AddDays(5),
                EndTime = DateTime.UtcNow.AddDays(5).AddHours(1),
                Seats = 2,
                CustomerName = "Camille",
                CustomerEmail = "camille@example.com",
                BookingRef = "SUSP" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(),
            };
            db.Bookings.Add(booking);
            await db.SaveChangesAsync();
            return booking.BookingRef;
        });

        (await _h.Operator().PostAsJsonAsync($"/api/platform/restaurants/{id}/suspend", new { })).EnsureSuccessStatusCode();

        Booking kept = await _h.InDbAsync(db => db.Bookings.FirstAsync(b => b.BookingRef == bookingRef));
        Assert.False(kept.IsCancelled);
        Assert.Equal("Camille", kept.CustomerName);

        HttpResponseMessage cancel = await _h.Client().PostAsJsonAsync($"/api/bookings/ref/{bookingRef}/cancel", new { email = "camille@example.com" });
        Assert.True(cancel.IsSuccessStatusCode, await cancel.Content.ReadAsStringAsync());
    }

    // ── Retention ────────────────────────────────────────────────────────────

    private async Task<int> RestaurantWithRetentionAsync(string name, int? months)
        => await _h.InDbAsync(async db =>
        {
            var restaurant = new Restaurant { Name = name, Timezone = "Europe/Brussels", PublishedAt = DateTime.UtcNow, BookingRetentionMonths = months };
            db.Restaurants.Add(restaurant);
            await db.SaveChangesAsync();
            return restaurant.Id;
        });

    private Task<int?> StoredRetentionAsync(int id)
        => _h.InDbAsync(db => db.Restaurants.AsNoTracking().Where(r => r.Id == id).Select(r => r.BookingRetentionMonths).FirstAsync());

    private Task<int> RetentionAuditCountAsync(int id)
        => _h.InDbAsync(db => db.AdminAuditEntries.CountAsync(a => a.Action == AuditActions.PlatformRetentionSet && a.TargetId == id.ToString()));

    [Fact]
    public async Task SetRetention_FixesThePeriodOfAnExistingRestaurant_AndTheAuditEntryRecordsBeforeAndAfter()
    {
        int id = await RestaurantWithRetentionAsync("Durée Posée", null);

        HttpResponseMessage response = await _h.Operator().PutAsJsonAsync($"/api/platform/restaurants/{id}/retention", new { months = 6 });

        response.EnsureSuccessStatusCode();
        PlatformRestaurantDto row = (await response.Content.ReadFromJsonAsync<PlatformRestaurantDto>(Json))!;
        Assert.Equal(6, row.BookingRetentionMonths);
        Assert.Equal(6, await StoredRetentionAsync(id));

        AdminAuditEntry entry = await _h.InDbAsync(db => db.AdminAuditEntries
            .OrderByDescending(a => a.Id).FirstAsync(a => a.Action == AuditActions.PlatformRetentionSet && a.TargetId == id.ToString()));
        Assert.Equal(TestWebAppFactory.AdminEmail, entry.ActorEmail);
        Assert.Contains("bookingRetentionMonths", entry.ChangesJson);
        Assert.Contains("6", entry.Summary);
    }

    [Fact]
    public async Task SetRetention_WithANullPeriod_SwitchesTheAutomaticErasureOff()
    {
        int id = await RestaurantWithRetentionAsync("Durée Retirée", 12);

        HttpResponseMessage response = await _h.Operator().PutAsJsonAsync($"/api/platform/restaurants/{id}/retention", new { months = (int?)null });

        response.EnsureSuccessStatusCode();
        Assert.Null((await response.Content.ReadFromJsonAsync<PlatformRestaurantDto>(Json))!.BookingRetentionMonths);
        Assert.Null(await StoredRetentionAsync(id));
        Assert.Equal(1, await RetentionAuditCountAsync(id));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(61)]
    [InlineData(-3)]
    public async Task SetRetention_RefusesAPeriodOutsideOneToSixty_WithItsCode_AndWritesNothing(int months)
    {
        int id = await RestaurantWithRetentionAsync("Durée Refusée" + months, 18);

        HttpResponseMessage response = await _h.Operator().PutAsJsonAsync($"/api/platform/restaurants/{id}/retention", new { months });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(ErrorCodes.PlatformRetentionInvalid, Code(await ErrorOf(response)));
        Assert.Equal(18, await StoredRetentionAsync(id));
        Assert.Equal(0, await RetentionAuditCountAsync(id));
    }

    [Fact]
    public async Task SetRetention_OnAnUnknownOrArchivedRestaurant_IsTheSameNotFound_AndWritesNothing()
    {
        int archived = await _h.InDbAsync(async db =>
        {
            var restaurant = new Restaurant { Name = "Archivé Durée", IsArchived = true, BookingRetentionMonths = 18 };
            db.Restaurants.Add(restaurant);
            await db.SaveChangesAsync();
            return restaurant.Id;
        });

        HttpResponseMessage unknown = await _h.Operator().PutAsJsonAsync("/api/platform/restaurants/987654/retention", new { months = 6 });
        HttpResponseMessage gone = await _h.Operator().PutAsJsonAsync($"/api/platform/restaurants/{archived}/retention", new { months = 6 });

        Assert.Equal(HttpStatusCode.NotFound, unknown.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, gone.StatusCode);
        Assert.Equal(ErrorCodes.PlatformNotFound, Code(await ErrorOf(unknown)));
        Assert.Equal(ErrorCodes.PlatformNotFound, Code(await ErrorOf(gone)));
        Assert.Equal(18, await StoredRetentionAsync(archived));
        Assert.Equal(0, await RetentionAuditCountAsync(archived));
    }

    [Fact]
    public async Task SetRetention_RefusedToAManager_LeavesThePeriodAsItWas()
    {
        int id = await RestaurantWithRetentionAsync("Durée Intacte", null);

        HttpResponseMessage response = await (await _h.ManagerAsync()).PutAsJsonAsync($"/api/platform/restaurants/{id}/retention", new { months = 6 });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Null(await StoredRetentionAsync(id));
        Assert.Equal(0, await RetentionAuditCountAsync(id));
    }

    [Fact]
    public async Task List_CarriesEachRestaurantsRetention_NullWhenNoPeriodIsFixed()
    {
        int none = await RestaurantWithRetentionAsync("Liste Sans Durée", null);
        int six = await RestaurantWithRetentionAsync("Liste Six Mois", 6);

        List<PlatformRestaurantDto> rows = (await _h.Operator().GetFromJsonAsync<List<PlatformRestaurantDto>>("/api/platform/restaurants", Json))!;

        Assert.Null(rows.Single(r => r.Id == none).BookingRetentionMonths);
        Assert.Equal(6, rows.Single(r => r.Id == six).BookingRetentionMonths);
    }

    // ── The list ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task List_CarriesStatusLastSignInAndCounts_AndNoGuestField()
    {
        (int id, HttpClient restaurateur) = await _h.RunningRestaurantAsync("Compté");
        await _h.InDbAsync(async db =>
        {
            db.Bookings.AddRange(
                new Booking { RestaurantId = id, Date = DateTime.UtcNow.AddDays(2), Seats = 2, CustomerName = "Zoé Secrète", CustomerEmail = "zoe.secrete@example.com", SpecialRequests = "allergie au céleri", BookingRef = "LST" + Guid.NewGuid().ToString("N")[..6] },
                new Booking { RestaurantId = id, Date = DateTime.UtcNow.AddDays(-2), Seats = 4, CustomerName = "Léo Secret", CustomerEmail = "leo.secret@example.com", BookingRef = "LSU" + Guid.NewGuid().ToString("N")[..6] },
                new Booking { RestaurantId = id, Date = DateTime.UtcNow.AddDays(3), Seats = 2, IsCancelled = true, CustomerName = "Annulé Secret", BookingRef = "LSV" + Guid.NewGuid().ToString("N")[..6] });
            await db.SaveChangesAsync();
        });
        string email = (await restaurateur.GetFromJsonAsync<OnboardingMeDto>("/api/onboarding/me", Json))!.Email;
        (await _h.Client().PostAsJsonAsync("/api/admin/auth/login", new { email, password = Password })).EnsureSuccessStatusCode();

        HttpResponseMessage response = await _h.Operator().GetAsync("/api/platform/restaurants");
        string raw = await response.Content.ReadAsStringAsync();
        PlatformRestaurantDto row = JsonSerializer.Deserialize<List<PlatformRestaurantDto>>(raw, Json)!.Single(r => r.Id == id);

        Assert.Equal(2, row.TotalBookings);
        Assert.Equal(1, row.UpcomingBookings);
        Assert.Equal(email, row.OwnerEmail);
        Assert.NotNull(row.LastLoginAt);
        Assert.Equal("Draft", row.Status);
        Assert.Equal("Accepted", row.Invitation!.State);
        Assert.Equal(0, row.StepsDone);
        Assert.Equal("info", row.NextStep);
        foreach (string secret in new[] { "Zoé", "zoe.secrete", "Léo", "leo.secret", "céleri", "Annulé" })
        {
            Assert.DoesNotContain(secret, raw);
        }
    }

    [Fact]
    public async Task List_ShowsAPendingInvitation_BeforeTheAccountExists()
    {
        Invited invited = await _h.InviteAsync();

        PlatformRestaurantDto row = (await _h.Operator().GetFromJsonAsync<List<PlatformRestaurantDto>>("/api/platform/restaurants", Json))!
            .Single(r => r.Id == invited.RestaurantId);

        Assert.Equal("Pending", row.Invitation!.State);
        Assert.Equal(invited.Email, row.Invitation.Email);
        Assert.Null(row.OwnerEmail);
        Assert.Null(row.LastLoginAt);
    }

    // ── Guest data: only with a reason, and on the record ────────────────────

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("support")]
    public async Task GuestDataAccess_RefusesAMissingOrShortReason_AndRecordsNothing(string reason)
    {
        int id = await PublishedRestaurantAsync("Sans Motif");
        int audited = await _h.InDbAsync(db => db.AdminAuditEntries.CountAsync(a => a.Action == AuditActions.PlatformGuestDataAccess));

        HttpResponseMessage response = await _h.Operator().PostAsJsonAsync($"/api/platform/restaurants/{id}/guest-data-access", new { reason });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        string body = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("customerEmail", body);
        Assert.Equal(audited, await _h.InDbAsync(db => db.AdminAuditEntries.CountAsync(a => a.Action == AuditActions.PlatformGuestDataAccess)));
    }

    [Fact]
    public async Task GuestDataAccess_ReturnsTheGuests_AndTheAuditEntryCarriesTheReason()
    {
        int id = await PublishedRestaurantAsync("Avec Motif");
        await _h.InDbAsync(async db =>
        {
            db.Bookings.Add(new Booking { RestaurantId = id, Date = DateTime.UtcNow.AddDays(1), Seats = 3, CustomerName = "Inès Dupont", CustomerEmail = "ines@example.com", SpecialRequests = "poussette", BookingRef = "ACC" + Guid.NewGuid().ToString("N")[..6] });
            await db.SaveChangesAsync();
        });

        HttpResponseMessage response = await _h.Operator().PostAsJsonAsync($"/api/platform/restaurants/{id}/guest-data-access",
            new { reason = "Ticket 4821 : le restaurateur demande un export" });

        response.EnsureSuccessStatusCode();
        GuestDataAccessDto granted = (await response.Content.ReadFromJsonAsync<GuestDataAccessDto>(Json))!;
        PlatformGuestBookingDto booking = Assert.Single(granted.Bookings);
        Assert.Equal("Inès Dupont", booking.CustomerName);
        Assert.Equal("ines@example.com", booking.CustomerEmail);

        AdminAuditEntry entry = await _h.InDbAsync(db => db.AdminAuditEntries
            .OrderByDescending(a => a.Id).FirstAsync(a => a.Action == AuditActions.PlatformGuestDataAccess && a.TargetId == id.ToString()));
        Assert.Contains("Ticket 4821", entry.Summary);
        Assert.Equal(TestWebAppFactory.AdminEmail, entry.ActorEmail);
        Assert.DoesNotContain("Inès", entry.Summary + entry.TargetLabel);
        Assert.DoesNotContain("ines@example.com", entry.Summary + entry.TargetLabel + entry.ChangesJson);
    }

    [Fact]
    public async Task GuestDataAccess_WithNoReasonField_OrATooLongOne_IsRefusedWithItsCode()
    {
        int id = await PublishedRestaurantAsync("Champ Absent");

        HttpResponseMessage absent = await _h.Operator().PostAsJsonAsync($"/api/platform/restaurants/{id}/guest-data-access", new { });
        HttpResponseMessage tooLong = await _h.Operator().PostAsJsonAsync($"/api/platform/restaurants/{id}/guest-data-access", new { reason = new string('x', 301) });

        Assert.Equal(HttpStatusCode.BadRequest, absent.StatusCode);
        Assert.Equal(ErrorCodes.PlatformAccessReasonRequired, Code(await ErrorOf(absent)));
        Assert.Equal(HttpStatusCode.BadRequest, tooLong.StatusCode);
        Assert.Equal(ErrorCodes.PlatformAccessReasonRequired, Code(await ErrorOf(tooLong)));
    }

    [Fact]
    public async Task AnArchivedRestaurant_CannotBeSuspendedInvitedOrRead_AndIsNotAServerError()
    {
        int id = await _h.InDbAsync(async db =>
        {
            var restaurant = new Restaurant { Name = "Archivé HTTP", IsArchived = true };
            db.Restaurants.Add(restaurant);
            await db.SaveChangesAsync();
            return restaurant.Id;
        });
        HttpClient op = _h.Operator();

        Assert.Equal(HttpStatusCode.NotFound, (await op.PostAsJsonAsync($"/api/platform/restaurants/{id}/suspend", new { })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await op.PostAsync($"/api/platform/restaurants/{id}/reactivate", null)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await op.PostAsJsonAsync($"/api/platform/restaurants/{id}/invitations", new { email = "a@b.example" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await op.PostAsJsonAsync($"/api/platform/restaurants/{id}/guest-data-access", new { reason = "Ticket 5 : motif valable" })).StatusCode);
    }

    [Fact]
    public async Task GuestDataAccess_ToAnUnknownRestaurant_IsANotFound_AndRecordsNothing()
    {
        int audited = await _h.InDbAsync(db => db.AdminAuditEntries.CountAsync(a => a.Action == AuditActions.PlatformGuestDataAccess));

        HttpResponseMessage response = await _h.Operator().PostAsJsonAsync("/api/platform/restaurants/987654/guest-data-access",
            new { reason = "Ticket 1 : une raison suffisante" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal(audited, await _h.InDbAsync(db => db.AdminAuditEntries.CountAsync(a => a.Action == AuditActions.PlatformGuestDataAccess)));
    }

    // ── The consent journal ──────────────────────────────────────────────────

    [Fact]
    public async Task Consents_ListTheThreeDocumentsAcceptedAtSignUp_WithTheirVersionAndHash()
    {
        (int id, HttpClient _) = await _h.RunningRestaurantAsync();

        List<LegalAcceptanceDto> consents = (await _h.Operator().GetFromJsonAsync<List<LegalAcceptanceDto>>($"/api/platform/restaurants/{id}/consents", Json))!;

        Assert.Equal(["dpa", "privacy", "terms"], consents.Select(c => c.DocumentKey).Order());
        Assert.All(consents, c =>
        {
            Assert.Equal(OpenRestoApi.Core.Application.Legal.LegalCatalog.Version, c.Version);
            Assert.Equal(64, c.ContentSha256.Length);
        });
    }
}
