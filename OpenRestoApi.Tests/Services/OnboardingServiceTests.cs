using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Legal;
using OpenRestoApi.Core.Application.Services;
using OpenRestoApi.Core.Application.Site;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;
using OpenRestoApi.Infrastructure.Persistence;
using OpenRestoApi.Tests.Integration;
using OpenRestoApi.Tests.TestInfrastructure;
using static OpenRestoApi.Tests.Integration.PlatformHarness;

namespace OpenRestoApi.Tests.Services;

/// <summary>
/// The rules of the setup assistant, on the real service over a real (in-memory SQLite) database:
/// the services are resolved from the application host with only the caller replaced, so every
/// rule is pinned through the same composition production runs.
/// </summary>
public sealed class OnboardingServiceTests(TestWebAppFactory factory) : IClassFixture<TestWebAppFactory>, IDisposable
{
    private readonly PlatformHarness _h = new(factory);

    public void Dispose() => _h.Dispose();

    private sealed record Caller(int RestaurantId, AdminCredential User, string Email);

    private async Task<Caller> RunningAsync(string? name = null)
    {
        Invited invited = await _h.InviteAsync(name);
        await _h.AcceptAsync(invited);
        AdminCredential user = await _h.InDbAsync(db => db.AdminCredentials.FirstAsync(c => c.Email == invited.Email));
        return new Caller(invited.RestaurantId, user, invited.Email);
    }

    private async Task<T> AsAsync<T>(AdminCredential? user, Func<OnboardingService, Task<T>> action)
    {
        using IServiceScope scope = _h.App.Services.CreateScope();
        FakeCurrentUser current = user is null ? FakeCurrentUser.Anonymous() : FakeCurrentUser.For(user);
        var service = ActivatorUtilities.CreateInstance<OnboardingService>(scope.ServiceProvider, current);
        return await action(service);
    }

    private static SaveOnboardingInfoRequest InfoRequest(Action<SaveOnboardingInfoRequest>? change = null)
    {
        var req = new SaveOnboardingInfoRequest
        {
            Name = "Brasserie de la Senne",
            Address = "Rue des Fabriques 25, 1000 Bruxelles",
            PhoneNumber = "+32 2 123 45 67",
            EmailAddress = "contact@senne.example",
            LegalName = "Senne Dorée SRL",
            CompanyNumber = ValidCompanyNumber,
            VatNumber = "BE0123456749",
        };
        change?.Invoke(req);
        return req;
    }

    private static SaveOnboardingHoursRequest HoursRequest() => new()
    {
        OpenHours =
        [
            new DayHoursDto { Day = 2, Open = "12:00", Close = "22:00" },
            new DayHoursDto { Day = 6, Open = "18:00", Close = "23:30" },
        ],
        DefaultBookingDurationMinutes = 90,
    };

    private static SaveOnboardingLayoutRequest LayoutRequest() => new()
    {
        Sections =
        [
            new OnboardingSectionDto
            {
                Name = "Salle",
                Tables = [new OnboardingTableDto { Name = "T1", Seats = 2 }, new OnboardingTableDto { Name = "T2", Seats = 6 }],
            },
        ],
    };

    private async Task<OnboardingStateDto> ReadyToPublishAsync(Caller c)
    {
        await AsAsync(c.User, s => s.SaveInfoAsync(c.RestaurantId, InfoRequest()));
        await AsAsync(c.User, s => s.SaveHoursAsync(c.RestaurantId, HoursRequest()));
        return await AsAsync(c.User, s => s.SaveLayoutAsync(c.RestaurantId, LayoutRequest()));
    }

    private Task<Restaurant> StoredAsync(int id) => _h.InDbAsync(db => db.Restaurants.AsNoTracking().FirstAsync(r => r.Id == id));

    private static async Task<TException> Refused<TException>(Task task) where TException : OpenRestoException
        => await Assert.ThrowsAsync<TException>(() => task);

    // ── The invitation ───────────────────────────────────────────────────────

    [Fact]
    public async Task AcceptInvitation_CreatesTheAccount_JournalsTheConsent_AndSignsIn()
    {
        Invited invited = await _h.InviteAsync();

        AcceptedInvitation accepted = await AsAsync<AcceptedInvitation>(null,
            s => s.AcceptInvitationAsync(invited.Token, new AcceptInvitationRequest
            {
                Password = Password,
                DisplayName = "  Gérante  ",
                AcceptedDocuments = CurrentDocuments(),
            }));

        Assert.Equal(invited.RestaurantId, accepted.RestaurantId);
        Assert.False(string.IsNullOrEmpty(accepted.Jwt));

        AdminCredential account = await _h.InDbAsync(db => db.AdminCredentials.FirstAsync(c => c.Email == invited.Email));
        Assert.Equal(UserRoles.Restaurateur, account.Role);
        Assert.Equal("Gérante", account.DisplayName);
        Assert.NotNull(account.LastLoginAt);
        Assert.NotEqual(Password, account.PasswordHash);
        Assert.Equal(1, await _h.InDbAsync(db => db.RestaurantMembers.CountAsync(m => m.UserId == account.Id && m.RestaurantId == invited.RestaurantId)));

        List<LegalAcceptance> journal = await _h.InDbAsync(db => db.LegalAcceptances.Where(a => a.RestaurantId == invited.RestaurantId).ToListAsync());
        Assert.Equal(["dpa", "privacy", "terms"], journal.Select(a => a.DocumentKey).Order());
        Assert.All(journal, a =>
        {
            LegalDocument document = LegalCatalog.Find(a.DocumentKey)!;
            Assert.Equal(document.Version, a.Version);
            Assert.Equal(document.ContentSha256, a.ContentSha256);
            Assert.Equal(account.Id, a.UserId);
            Assert.Equal(invited.Email, a.Email);
        });

        RestaurantInvitation spent = await _h.InDbAsync(db => db.RestaurantInvitations.FirstAsync(i => i.RestaurantId == invited.RestaurantId));
        Assert.Equal(account.Id, spent.AcceptedByUserId);
        Assert.NotNull(spent.AcceptedAt);
    }

    [Fact]
    public async Task AcceptInvitation_RefusesWithoutEveryDocument_AndCreatesNothing()
    {
        Invited invited = await _h.InviteAsync();
        List<LegalDocumentRefDto> withoutDpa = [.. CurrentDocuments().Where(d => d.Key != LegalDocumentKeys.Dpa)];

        OpenRestoException refused = await Refused<ValidationException>(AsAsync<AcceptedInvitation>(null,
            s => s.AcceptInvitationAsync(invited.Token, new AcceptInvitationRequest { Password = Password, AcceptedDocuments = withoutDpa })));

        Assert.Equal(ErrorCodes.OnboardingConsentRequired, refused.Code);
        await AssertNothingCreatedAsync(invited);
    }

    [Fact]
    public async Task AcceptInvitation_RefusesAnOutdatedVersion_AndCreatesNothing()
    {
        Invited invited = await _h.InviteAsync();
        List<LegalDocumentRefDto> stale = [.. CurrentDocuments().Select(d => new LegalDocumentRefDto
        {
            Key = d.Key,
            Version = d.Key == LegalDocumentKeys.Terms ? "2020-01-01" : d.Version,
        })];

        OpenRestoException refused = await Refused<ValidationException>(AsAsync<AcceptedInvitation>(null,
            s => s.AcceptInvitationAsync(invited.Token, new AcceptInvitationRequest { Password = Password, AcceptedDocuments = stale })));

        Assert.Equal(ErrorCodes.OnboardingConsentOutdated, refused.Code);
        await AssertNothingCreatedAsync(invited);
    }

    [Theory]
    [InlineData(9, false)]
    [InlineData(10, true)]
    public async Task AcceptInvitation_HoldsThePasswordToTenCharacters(int length, bool accepted)
    {
        Invited invited = await _h.InviteAsync();
        var request = new AcceptInvitationRequest { Password = new string('p', length), AcceptedDocuments = CurrentDocuments() };

        if (accepted)
        {
            await AsAsync<AcceptedInvitation>(null, s => s.AcceptInvitationAsync(invited.Token, request));
            Assert.Equal(1, await _h.InDbAsync(db => db.AdminCredentials.CountAsync(c => c.Email == invited.Email)));
            return;
        }

        OpenRestoException refused = await Refused<ValidationException>(AsAsync<AcceptedInvitation>(null, s => s.AcceptInvitationAsync(invited.Token, request)));
        Assert.Equal(ErrorCodes.UserPasswordTooShort, refused.Code);
        await AssertNothingCreatedAsync(invited);
    }

    [Fact]
    public async Task AcceptInvitation_WorksOnce_AndNotOnAnExpiredOrUnknownToken()
    {
        Invited invited = await _h.InviteAsync();
        Invited late = await _h.InviteAsync();
        await _h.InDbAsync(async db =>
        {
            RestaurantInvitation row = await db.RestaurantInvitations.FirstAsync(i => i.RestaurantId == late.RestaurantId);
            row.ExpiresAt = DateTime.UtcNow.AddSeconds(-1);
            await db.SaveChangesAsync();
        });
        var request = new AcceptInvitationRequest { Password = Password, AcceptedDocuments = CurrentDocuments() };

        await AsAsync<AcceptedInvitation>(null, s => s.AcceptInvitationAsync(invited.Token, request));

        foreach (string token in new[] { invited.Token, late.Token, "nope", "", InvitationToken.New() })
        {
            OpenRestoException refused = await Refused<NotFoundException>(AsAsync<AcceptedInvitation>(null, s => s.AcceptInvitationAsync(token, request)));
            Assert.Equal(ErrorCodes.PlatformInvitationInvalid, refused.Code);
        }

        Assert.Equal(0, await _h.InDbAsync(db => db.AdminCredentials.CountAsync(c => c.Email == late.Email)));
    }

    [Fact]
    public async Task AcceptInvitation_ForARestaurantTheAccountAlreadyRuns_SetsANewPassword()
    {
        Caller c = await RunningAsync();
        string oldHash = c.User.PasswordHash;
        int sessionVersion = c.User.SessionVersion;
        string again = (await _h.Operator().PostAsJsonAsync($"/api/platform/restaurants/{c.RestaurantId}/invitations", new { }))
            .EnsureSuccessStatusCode().Content.ReadFromJsonAsync<PlatformInvitationResultDto>(Json).Result!.InvitationUrl;

        await AsAsync<AcceptedInvitation>(null, s => s.AcceptInvitationAsync(TokenOf(again),
            new AcceptInvitationRequest { Password = "another-long-password", AcceptedDocuments = CurrentDocuments() }));

        AdminCredential after = await _h.InDbAsync(db => db.AdminCredentials.FirstAsync(a => a.Id == c.User.Id));
        Assert.NotEqual(oldHash, after.PasswordHash);
        Assert.Equal(sessionVersion + 1, after.SessionVersion);
        Assert.Equal(1, await _h.InDbAsync(db => db.AdminCredentials.CountAsync(a => a.Email == c.Email)));
        Assert.Equal(1, await _h.InDbAsync(db => db.RestaurantMembers.CountAsync(m => m.RestaurantId == c.RestaurantId)));
    }

    [Fact]
    public async Task AcceptInvitation_CannotClaimAnAddressThatBelongsToAnotherAccount()
    {
        Invited invited = await _h.InviteAsync();
        await _h.InDbAsync(async db =>
        {
            db.AdminCredentials.Add(new AdminCredential { Email = invited.Email, PasswordHash = "keep", PasswordSalt = "keep", Role = UserRoles.Manager });
            await db.SaveChangesAsync();
        });

        OpenRestoException refused = await Refused<NotFoundException>(AsAsync<AcceptedInvitation>(null,
            s => s.AcceptInvitationAsync(invited.Token, new AcceptInvitationRequest { Password = Password, AcceptedDocuments = CurrentDocuments() })));

        Assert.Equal(ErrorCodes.PlatformInvitationInvalid, refused.Code);
        AdminCredential untouched = await _h.InDbAsync(db => db.AdminCredentials.FirstAsync(a => a.Email == invited.Email));
        Assert.Equal("keep", untouched.PasswordHash);
        Assert.Equal(0, await _h.InDbAsync(db => db.RestaurantMembers.CountAsync(m => m.RestaurantId == invited.RestaurantId)));
        Assert.Null((await _h.InDbAsync(db => db.RestaurantInvitations.FirstAsync(i => i.RestaurantId == invited.RestaurantId))).AcceptedAt);
    }

    private async Task AssertNothingCreatedAsync(Invited invited)
    {
        Assert.Equal(0, await _h.InDbAsync(db => db.AdminCredentials.CountAsync(c => c.Email == invited.Email)));
        Assert.Equal(0, await _h.InDbAsync(db => db.RestaurantMembers.CountAsync(m => m.RestaurantId == invited.RestaurantId)));
        Assert.Equal(0, await _h.InDbAsync(db => db.LegalAcceptances.CountAsync(a => a.RestaurantId == invited.RestaurantId)));
        RestaurantInvitation row = await _h.InDbAsync(db => db.RestaurantInvitations.FirstAsync(i => i.RestaurantId == invited.RestaurantId));
        Assert.Null(row.AcceptedAt);
    }

    // ── Who may touch which restaurant ───────────────────────────────────────

    [Fact]
    public async Task AnotherRestaurantsId_IsANotFound_ForEveryOperation()
    {
        Caller mine = await RunningAsync("Le Mien");
        Caller theirs = await RunningAsync("Le Leur");
        int id = theirs.RestaurantId;
        string before = (await StoredAsync(id)).Name;

        var operations = new Dictionary<string, Func<OnboardingService, Task>>
        {
            ["state"] = s => s.GetStateAsync(id),
            ["preview"] = s => s.GetPreviewAsync(id),
            ["site preview"] = s => s.PreviewSiteAsync(id, null),
            ["info"] = s => s.SaveInfoAsync(id, InfoRequest(r => r.Name = "Piraté")),
            ["hours"] = s => s.SaveHoursAsync(id, HoursRequest()),
            ["layout"] = s => s.SaveLayoutAsync(id, LayoutRequest()),
            ["menu"] = s => s.SaveMenuAsync(id, new SaveOnboardingMenuRequest { Categories = [] }),
            ["branding"] = s => s.SaveBrandingAsync(id, new SaveOnboardingBrandingRequest { Theme = "Cafe" }),
            ["logo"] = s => s.DeleteLogoAsync(id),
            ["skip"] = s => s.SkipStepAsync(id, "menu"),
            ["publish"] = s => s.PublishAsync(id),
            ["unpublish"] = s => s.UnpublishAsync(id),
        };

        foreach ((string label, Func<OnboardingService, Task> operation) in operations)
        {
            NotFoundException refused = await Assert.ThrowsAsync<NotFoundException>(() => AsAsync(mine.User, async s => { await operation(s); return 0; }));
            Assert.True(refused.Code == ErrorCodes.PlatformNotFound, $"{label}: {refused.Code}");
        }

        NotFoundException missing = await Assert.ThrowsAsync<NotFoundException>(() => AsAsync(mine.User, s => s.GetStateAsync(987654)));
        Assert.Equal(ErrorCodes.PlatformNotFound, missing.Code);
        NotFoundException anonymous = await Assert.ThrowsAsync<NotFoundException>(() => AsAsync(null, s => s.GetStateAsync(mine.RestaurantId)));
        Assert.Equal(ErrorCodes.PlatformNotFound, anonymous.Code);

        Restaurant after = await StoredAsync(id);
        Assert.Equal(before, after.Name);
        Assert.Null(after.OnboardingSteps);
        Assert.Equal(RestaurantStatus.Draft, after.Status);
        Assert.Equal(0, await _h.InDbAsync(db => db.Sections.CountAsync(s => s.RestaurantId == id)));
    }

    [Fact]
    public async Task AnArchivedRestaurant_IsANotFound_EvenForItsOwner()
    {
        Caller c = await RunningAsync();
        await _h.InDbAsync(async db =>
        {
            (await db.Restaurants.FirstAsync(r => r.Id == c.RestaurantId)).IsArchived = true;
            await db.SaveChangesAsync();
        });

        await Assert.ThrowsAsync<NotFoundException>(() => AsAsync(c.User, s => s.GetStateAsync(c.RestaurantId)));
        Assert.Empty((await AsAsync(c.User, s => s.GetMeAsync())).Restaurants);
    }

    // ── Step 1 ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task SaveInfo_StoresTheRestaurantAndTheLegalIdentity_AndMarksTheStepDone()
    {
        Caller c = await RunningAsync();

        OnboardingStateDto state = await AsAsync(c.User, s => s.SaveInfoAsync(c.RestaurantId, InfoRequest(r =>
        {
            r.CompanyNumber = "BE 0123 456 749";
            r.VatNumber = " be0123.456.749 ";
            r.BookingRetentionMonths = 24;
        })));

        Restaurant stored = await StoredAsync(c.RestaurantId);
        Assert.Equal("Brasserie de la Senne", stored.Name);
        Assert.Equal("Rue des Fabriques 25, 1000 Bruxelles", stored.Address);
        Assert.Equal("+32 2 123 45 67", stored.PhoneNumber);
        Assert.Equal("contact@senne.example", stored.EmailAddress);
        Assert.Equal("BE0123456749", stored.VatNumber);
        Assert.Equal(24, stored.BookingRetentionMonths);
        Assert.Equal(OnboardingStepState.Done, OnboardingProgress.StateOf(stored.OnboardingSteps, OnboardingStep.Info));

        Assert.Equal(ValidCompanyNumber, state.Info.CompanyNumber);
        Assert.Equal("Senne Dorée SRL", state.Info.LegalName);
        Assert.Equal("Done", state.Steps.Single(x => x.Key == "info").State);
        Assert.Equal("hours", state.NextStep);

        RestaurantSite site = await _h.InDbAsync(db => db.RestaurantSites.AsNoTracking().FirstAsync(x => x.RestaurantId == c.RestaurantId));
        Assert.Equal("Senne Dorée SRL", site.LegalName);
        Assert.Equal(ValidCompanyNumber, site.CompanyNumber);
        Assert.Equal("BE0123456749", site.VatNumber);
        Assert.Equal("Rue des Fabriques 25, 1000 Bruxelles", site.LegalAddress);
        Assert.StartsWith("brasserie-de-la-senne", site.Slug);
    }

    [Fact]
    public async Task SaveInfo_LeavesTheVatOptional_AndClearsItWhenBlank()
    {
        Caller c = await RunningAsync();
        await AsAsync(c.User, s => s.SaveInfoAsync(c.RestaurantId, InfoRequest()));

        OnboardingStateDto state = await AsAsync(c.User, s => s.SaveInfoAsync(c.RestaurantId, InfoRequest(r => r.VatNumber = "  ")));

        Assert.Null(state.Info.VatNumber);
        Assert.Null((await StoredAsync(c.RestaurantId)).VatNumber);
    }

    [Theory]
    [InlineData("0123.456.748", ErrorCodes.OnboardingCompanyNumberInvalid)]
    [InlineData("12345", ErrorCodes.OnboardingCompanyNumberInvalid)]
    [InlineData("", ErrorCodes.OnboardingCompanyNumberRequired)]
    public async Task SaveInfo_RefusesAnInvalidCompanyNumber_AndWritesNothing(string number, string code)
    {
        Caller c = await RunningAsync();
        Restaurant before = await StoredAsync(c.RestaurantId);

        OpenRestoException refused = await Refused<ValidationException>(AsAsync(c.User, s => s.SaveInfoAsync(c.RestaurantId, InfoRequest(r => r.CompanyNumber = number))));

        Assert.Equal(code, refused.Code);
        Restaurant after = await StoredAsync(c.RestaurantId);
        Assert.Equal(before.Name, after.Name);
        Assert.Null(after.OnboardingSteps);
        Assert.Equal(0, await _h.InDbAsync(db => db.RestaurantSites.CountAsync(x => x.RestaurantId == c.RestaurantId)));
    }

    [Theory]
    [InlineData("VatNumber", "BE0123456748", ErrorCodes.OnboardingVatInvalid)]
    [InlineData("PhoneNumber", "12 34", ErrorCodes.OnboardingPhoneRequired)]
    [InlineData("EmailAddress", "nope", ErrorCodes.ContactEmailInvalid)]
    [InlineData("Address", "  ", ErrorCodes.OnboardingAddressRequired)]
    [InlineData("LegalName", "", ErrorCodes.OnboardingLegalNameRequired)]
    [InlineData("Name", " ", ErrorCodes.OnboardingNameRequired)]
    public async Task SaveInfo_RefusesEachBadField_AndWritesNothing(string field, string value, string code)
    {
        Caller c = await RunningAsync();

        OpenRestoException refused = await Refused<ValidationException>(AsAsync(c.User, s => s.SaveInfoAsync(c.RestaurantId, InfoRequest(r =>
            typeof(SaveOnboardingInfoRequest).GetProperty(field)!.SetValue(r, value)))));

        Assert.Equal(code, refused.Code);
        Assert.Null((await StoredAsync(c.RestaurantId)).OnboardingSteps);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(61)]
    [InlineData(-3)]
    public async Task SaveInfo_RefusesARetentionOutsideOneToSixtyMonths(int months)
    {
        Caller c = await RunningAsync();

        OpenRestoException refused = await Refused<ValidationException>(AsAsync(c.User, s => s.SaveInfoAsync(c.RestaurantId, InfoRequest(r => r.BookingRetentionMonths = months))));

        Assert.Equal(ErrorCodes.OnboardingRetentionInvalid, refused.Code);
        Assert.Equal(12, (await StoredAsync(c.RestaurantId)).BookingRetentionMonths);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(60)]
    public async Task SaveInfo_AcceptsTheEdgesOfTheRetentionRange(int months)
    {
        Caller c = await RunningAsync();

        await AsAsync(c.User, s => s.SaveInfoAsync(c.RestaurantId, InfoRequest(r => r.BookingRetentionMonths = months)));

        Assert.Equal(months, (await StoredAsync(c.RestaurantId)).BookingRetentionMonths);
    }

    private Task SetStoredRetentionAsync(int restaurantId, int? months)
        => _h.InDbAsync(db => db.Restaurants.Where(r => r.Id == restaurantId)
            .ExecuteUpdateAsync(set => set.SetProperty(r => r.BookingRetentionMonths, months)));

    [Fact]
    public async Task ARestaurantWithNoPeriod_ShowsTheDefaultInTheInfoStep_WithoutStoringItByBeingRead()
    {
        Caller c = await RunningAsync();
        await SetStoredRetentionAsync(c.RestaurantId, null);

        OnboardingStateDto state = await AsAsync(c.User, s => s.GetStateAsync(c.RestaurantId));

        Assert.Equal(BookingRetention.DefaultMonths, state.Info.BookingRetentionMonths);
        Assert.Null((await StoredAsync(c.RestaurantId)).BookingRetentionMonths);
    }

    [Fact]
    public async Task SavingTheInfoStep_FixesThePeriodOfARestaurantThatHadNone_AtTheDefaultOrAtTheChosenValue()
    {
        Caller c = await RunningAsync();
        await SetStoredRetentionAsync(c.RestaurantId, null);

        OnboardingStateDto atDefault = await AsAsync(c.User, s => s.SaveInfoAsync(c.RestaurantId, InfoRequest()));

        Assert.Equal(BookingRetention.DefaultMonths, atDefault.Info.BookingRetentionMonths);
        Assert.Equal(BookingRetention.DefaultMonths, (await StoredAsync(c.RestaurantId)).BookingRetentionMonths);

        await SetStoredRetentionAsync(c.RestaurantId, null);
        await AsAsync(c.User, s => s.SaveInfoAsync(c.RestaurantId, InfoRequest(r => r.BookingRetentionMonths = 36)));

        Assert.Equal(36, (await StoredAsync(c.RestaurantId)).BookingRetentionMonths);
    }

    [Fact]
    public async Task SavingTheInfoStep_WithoutAPeriod_KeepsTheOneThePlatformFixed()
    {
        Caller c = await RunningAsync();
        await SetStoredRetentionAsync(c.RestaurantId, 6);

        await AsAsync(c.User, s => s.SaveInfoAsync(c.RestaurantId, InfoRequest()));

        Assert.Equal(6, (await StoredAsync(c.RestaurantId)).BookingRetentionMonths);
    }

    // ── Step 2 ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task SaveHours_SetsTheOpenDaysAndTheirHours()
    {
        Caller c = await RunningAsync();

        OnboardingStateDto state = await AsAsync(c.User, s => s.SaveHoursAsync(c.RestaurantId, HoursRequest()));

        Restaurant stored = await StoredAsync(c.RestaurantId);
        Assert.Equal("2,6", stored.OpenDays);
        Assert.Equal(90, stored.DefaultBookingDurationMinutes);
        Assert.Equal([2, 6], state.Hours.OpenHours.Select(d => d.Day));
        Assert.Equal(("12:00", "22:00"), OpeningHours.GetHoursForDay(stored, 2));
        Assert.Equal(("18:00", "23:30"), OpeningHours.GetHoursForDay(stored, 6));
        Assert.Equal("Done", state.Steps.Single(x => x.Key == "hours").State);
    }

    [Fact]
    public async Task SaveHours_RefusesAWeekWithNoOpenDay_AndWritesNothing()
    {
        Caller c = await RunningAsync();
        Restaurant before = await StoredAsync(c.RestaurantId);

        OpenRestoException refused = await Refused<ValidationException>(AsAsync(c.User, s => s.SaveHoursAsync(c.RestaurantId, new SaveOnboardingHoursRequest { OpenHours = [] })));

        Assert.Equal(ErrorCodes.OnboardingHoursNoOpenDay, refused.Code);
        Restaurant after = await StoredAsync(c.RestaurantId);
        Assert.Equal(before.OpenDays, after.OpenDays);
        Assert.Null(after.OnboardingSteps);
    }

    [Theory]
    [InlineData(0, "12:00", "22:00", ErrorCodes.RestaurantOpenHoursDayInvalid)]
    [InlineData(8, "12:00", "22:00", ErrorCodes.RestaurantOpenHoursDayInvalid)]
    [InlineData(2, "25:00", "22:00", ErrorCodes.RestaurantOpenHoursTimeInvalid)]
    [InlineData(2, "12:00", "noon", ErrorCodes.RestaurantOpenHoursTimeInvalid)]
    public async Task SaveHours_RefusesAnImpossibleDayOrTime_AndWritesNothing(int day, string open, string close, string code)
    {
        Caller c = await RunningAsync();

        OpenRestoException refused = await Refused<ValidationException>(AsAsync(c.User, s => s.SaveHoursAsync(c.RestaurantId,
            new SaveOnboardingHoursRequest { OpenHours = [new DayHoursDto { Day = day, Open = open, Close = close }] })));

        Assert.Equal(code, refused.Code);
        Assert.Null((await StoredAsync(c.RestaurantId)).OnboardingSteps);
    }

    [Fact]
    public async Task SaveHours_RefusesADurationThatIsNotOneOfTheAllowedOnes()
    {
        Caller c = await RunningAsync();

        OpenRestoException refused = await Refused<ValidationException>(AsAsync(c.User, s => s.SaveHoursAsync(c.RestaurantId,
            new SaveOnboardingHoursRequest { OpenHours = HoursRequest().OpenHours, DefaultBookingDurationMinutes = 47 })));

        Assert.Equal(ErrorCodes.RestaurantDurationInvalid, refused.Code);
        Assert.Equal(60, (await StoredAsync(c.RestaurantId)).DefaultBookingDurationMinutes);
    }

    // ── Step 3 ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task SaveLayout_AddsRenamesAndRemoves_AndKeepsTheIdsItWasGiven()
    {
        Caller c = await RunningAsync();
        OnboardingStateDto first = await AsAsync(c.User, s => s.SaveLayoutAsync(c.RestaurantId, LayoutRequest()));
        OnboardingSectionDto room = first.Layout.Sections.Single();
        OnboardingTableDto t1 = room.Tables.Single(t => t.Name == "T1");

        OnboardingStateDto second = await AsAsync(c.User, s => s.SaveLayoutAsync(c.RestaurantId, new SaveOnboardingLayoutRequest
        {
            Sections =
            [
                new OnboardingSectionDto
                {
                    Id = room.Id,
                    Name = "Grande salle",
                    Tables = [new OnboardingTableDto { Id = t1.Id, Name = "Table 1", Seats = 4 }, new OnboardingTableDto { Name = "T9", Seats = 8 }],
                },
                new OnboardingSectionDto { Name = "Terrasse", Tables = [new OnboardingTableDto { Name = "E1", Seats = 2 }] },
            ],
        }));

        OnboardingSectionDto kept = second.Layout.Sections.First();
        Assert.Equal(room.Id, kept.Id);
        Assert.Equal("Grande salle", kept.Name);
        Assert.Contains(kept.Tables, t => t.Id == t1.Id && t.Name == "Table 1" && t.Seats == 4);
        Assert.DoesNotContain(kept.Tables, t => t.Name == "T2");
        Assert.Contains(kept.Tables, t => t.Name == "T9" && t.Seats == 8);
        Assert.Equal(["Grande salle", "Terrasse"], second.Layout.Sections.Select(s => s.Name));
        Assert.Equal("Done", second.Steps.Single(x => x.Key == "layout").State);
    }

    [Fact]
    public async Task SaveLayout_RemovesARoomAndItsTables_WhenNothingIsBookedThere()
    {
        Caller c = await RunningAsync();
        await AsAsync(c.User, s => s.SaveLayoutAsync(c.RestaurantId, new SaveOnboardingLayoutRequest
        {
            Sections =
            [
                new OnboardingSectionDto { Name = "A", Tables = [new OnboardingTableDto { Seats = 2 }] },
                new OnboardingSectionDto { Name = "B", Tables = [new OnboardingTableDto { Seats = 2 }] },
            ],
        }));
        OnboardingSectionDto keep = (await AsAsync(c.User, s => s.GetStateAsync(c.RestaurantId))).Layout.Sections.First();

        OnboardingStateDto state = await AsAsync(c.User, s => s.SaveLayoutAsync(c.RestaurantId, new SaveOnboardingLayoutRequest { Sections = [keep] }));

        Assert.Equal(["A"], state.Layout.Sections.Select(s => s.Name));
        Assert.Equal(1, await _h.InDbAsync(db => db.Tables.CountAsync(t => t.Section!.RestaurantId == c.RestaurantId)));
    }

    [Fact]
    public async Task SaveLayout_RefusesToRemoveATableWithAnUpcomingBooking_AndChangesNothing()
    {
        Caller c = await RunningAsync();
        OnboardingStateDto state = await AsAsync(c.User, s => s.SaveLayoutAsync(c.RestaurantId, LayoutRequest()));
        OnboardingSectionDto room = state.Layout.Sections.Single();
        OnboardingTableDto booked = room.Tables.Single(t => t.Name == "T1");
        await _h.InDbAsync(async db =>
        {
            db.Bookings.Add(new Booking
            {
                RestaurantId = c.RestaurantId,
                TableId = booked.Id,
                SectionId = room.Id,
                Date = DateTime.UtcNow.AddDays(3),
                EndTime = DateTime.UtcNow.AddDays(3).AddHours(1),
                Seats = 2,
                CustomerName = "Camille",
                CustomerEmail = "camille@example.com",
                BookingRef = "LAY" + Guid.NewGuid().ToString("N")[..6],
            });
            await db.SaveChangesAsync();
        });

        var withoutBooked = new SaveOnboardingLayoutRequest
        {
            Sections = [new OnboardingSectionDto { Id = room.Id, Name = "Renommée", Tables = [.. room.Tables.Where(t => t.Id != booked.Id), new OnboardingTableDto { Name = "Nouvelle", Seats = 2 }] }],
        };
        OpenRestoException refused = await Refused<BusinessRuleException>(AsAsync(c.User, s => s.SaveLayoutAsync(c.RestaurantId, withoutBooked)));
        OpenRestoException refusedRoom = await Refused<BusinessRuleException>(AsAsync(c.User, s => s.SaveLayoutAsync(c.RestaurantId,
            new SaveOnboardingLayoutRequest { Sections = [new OnboardingSectionDto { Name = "Autre", Tables = [new OnboardingTableDto { Seats = 2 }] }] })));

        Assert.Equal(ErrorCodes.OnboardingLayoutInUse, refused.Code);
        Assert.Equal(ErrorCodes.OnboardingLayoutInUse, refusedRoom.Code);
        OnboardingStateDto after = await AsAsync(c.User, s => s.GetStateAsync(c.RestaurantId));
        Assert.Equal("Salle", after.Layout.Sections.Single().Name);
        Assert.Equal(2, after.Layout.Sections.Single().Tables.Count);
        Booking kept = await _h.InDbAsync(db => db.Bookings.AsNoTracking().FirstAsync(b => b.RestaurantId == c.RestaurantId));
        Assert.Equal(booked.Id, kept.TableId);
        Assert.Equal("Camille", kept.CustomerName);
    }

    [Fact]
    public async Task SaveLayout_AllowsRemovingATableWhoseBookingsAreCancelledOrPast()
    {
        Caller c = await RunningAsync();
        OnboardingStateDto state = await AsAsync(c.User, s => s.SaveLayoutAsync(c.RestaurantId, LayoutRequest()));
        OnboardingSectionDto room = state.Layout.Sections.Single();
        OnboardingTableDto t2 = room.Tables.Single(t => t.Name == "T2");
        await _h.InDbAsync(async db =>
        {
            db.Bookings.AddRange(
                new Booking { RestaurantId = c.RestaurantId, TableId = t2.Id, SectionId = room.Id, Date = DateTime.UtcNow.AddDays(3), Seats = 2, IsCancelled = true, BookingRef = "CAN" + Guid.NewGuid().ToString("N")[..6] },
                new Booking { RestaurantId = c.RestaurantId, TableId = t2.Id, SectionId = room.Id, Date = DateTime.UtcNow.AddDays(-3), Seats = 2, BookingRef = "PST" + Guid.NewGuid().ToString("N")[..6] });
            await db.SaveChangesAsync();
        });

        OnboardingStateDto after = await AsAsync(c.User, s => s.SaveLayoutAsync(c.RestaurantId, new SaveOnboardingLayoutRequest
        {
            Sections = [new OnboardingSectionDto { Id = room.Id, Name = room.Name, Tables = [.. room.Tables.Where(t => t.Id != t2.Id)] }],
        }));

        Assert.Single(after.Layout.Sections.Single().Tables);
        Assert.Equal(2, await _h.InDbAsync(db => db.Bookings.CountAsync(b => b.RestaurantId == c.RestaurantId)));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(51)]
    public async Task SaveLayout_RefusesATableOutsideOneToFiftySeats(int seats)
    {
        Caller c = await RunningAsync();

        OpenRestoException refused = await Refused<ValidationException>(AsAsync(c.User, s => s.SaveLayoutAsync(c.RestaurantId, new SaveOnboardingLayoutRequest
        {
            Sections = [new OnboardingSectionDto { Name = "Salle", Tables = [new OnboardingTableDto { Seats = seats }] }],
        })));

        Assert.Equal(ErrorCodes.OnboardingLayoutInvalid, refused.Code);
        Assert.Equal(0, await _h.InDbAsync(db => db.Sections.CountAsync(s => s.RestaurantId == c.RestaurantId)));
    }

    [Fact]
    public async Task SaveLayout_RefusesAnEmptyLayout_AndAnIdFromAnotherRestaurant()
    {
        Caller c = await RunningAsync();
        Caller other = await RunningAsync();
        OnboardingStateDto theirs = await AsAsync(other.User, s => s.SaveLayoutAsync(other.RestaurantId, LayoutRequest()));
        OnboardingSectionDto foreign = theirs.Layout.Sections.Single();

        OpenRestoException empty = await Refused<ValidationException>(AsAsync(c.User, s => s.SaveLayoutAsync(c.RestaurantId, new SaveOnboardingLayoutRequest { Sections = [] })));
        OpenRestoException stolen = await Refused<ValidationException>(AsAsync(c.User, s => s.SaveLayoutAsync(c.RestaurantId, new SaveOnboardingLayoutRequest
        {
            Sections = [new OnboardingSectionDto { Id = foreign.Id, Name = "À moi", Tables = [new OnboardingTableDto { Id = foreign.Tables[0].Id, Seats = 2 }] }],
        })));

        Assert.Equal(ErrorCodes.OnboardingLayoutEmpty, empty.Code);
        Assert.Equal(ErrorCodes.OnboardingLayoutInvalid, stolen.Code);
        Section untouched = await _h.InDbAsync(db => db.Sections.AsNoTracking().FirstAsync(s => s.Id == foreign.Id));
        Assert.Equal("Salle", untouched.Name);
        Assert.Equal(other.RestaurantId, untouched.RestaurantId);
    }

    // ── Step 4 ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task SaveMenu_BuildsTheFirstMenu_AndUpdatesItInPlace()
    {
        Caller c = await RunningAsync();
        var request = new SaveOnboardingMenuRequest
        {
            Name = "Carte d’automne",
            Categories =
            [
                new OnboardingMenuCategoryDto { Name = "Entrées", Items = [new OnboardingMenuItemDto { Name = "Croquettes", Description = "Deux pièces", PriceMinor = 1450 }] },
                new OnboardingMenuCategoryDto { Name = "Plats", Items = [new OnboardingMenuItemDto { Name = "Carbonade", PriceMinor = null }, new OnboardingMenuItemDto { Name = "Waterzooi", PriceMinor = 0 }] },
            ],
        };

        OnboardingStateDto first = await AsAsync(c.User, s => s.SaveMenuAsync(c.RestaurantId, request));

        Assert.Equal("Carte d’automne", first.Menu.Name);
        Assert.Equal(["Entrées", "Plats"], first.Menu.Categories.Select(x => x.Name));
        Assert.Equal(1450, first.Menu.Categories[0].Items.Single().PriceMinor);
        Assert.Null(first.Menu.Categories[1].Items[0].PriceMinor);
        Assert.Equal(0, first.Menu.Categories[1].Items[1].PriceMinor);
        Assert.Equal("Done", first.Steps.Single(x => x.Key == "menu").State);
        Assert.False(await _h.InDbAsync(db => db.Menus.AnyAsync(m => m.RestaurantId == c.RestaurantId && m.IsPublished)));

        OnboardingMenuCategoryDto starters = first.Menu.Categories[0];
        OnboardingMenuCategoryDto mains = first.Menu.Categories[1];
        OnboardingStateDto second = await AsAsync(c.User, s => s.SaveMenuAsync(c.RestaurantId, new SaveOnboardingMenuRequest
        {
            Name = "Carte d’hiver",
            Categories =
            [
                new OnboardingMenuCategoryDto
                {
                    Id = mains.Id,
                    Name = "Plats chauds",
                    Items = [new OnboardingMenuItemDto { Id = mains.Items[1].Id, Name = "Waterzooi de poulet", PriceMinor = 2400 }],
                },
                new OnboardingMenuCategoryDto { Id = starters.Id, Name = "Entrées", Items = [] },
            ],
        }));

        Assert.Equal(first.Menu.MenuId, second.Menu.MenuId);
        Assert.Equal("Carte d’hiver", second.Menu.Name);
        Assert.Equal(["Plats chauds", "Entrées"], second.Menu.Categories.Select(x => x.Name));
        Assert.Equal(mains.Id, second.Menu.Categories[0].Id);
        OnboardingMenuItemDto kept = Assert.Single(second.Menu.Categories[0].Items);
        Assert.Equal(mains.Items[1].Id, kept.Id);
        Assert.Equal(2400, kept.PriceMinor);
        Assert.Empty(second.Menu.Categories[1].Items);
        Assert.Equal(1, await _h.InDbAsync(db => db.Menus.CountAsync(m => m.RestaurantId == c.RestaurantId)));
    }

    [Fact]
    public async Task SaveMenu_KeepsWhatTheWizardDoesNotEdit_OnADishItUpdates()
    {
        Caller c = await RunningAsync();
        OnboardingStateDto state = await AsAsync(c.User, s => s.SaveMenuAsync(c.RestaurantId, new SaveOnboardingMenuRequest
        {
            Categories = [new OnboardingMenuCategoryDto { Name = "Plats", Items = [new OnboardingMenuItemDto { Name = "Carbonade", PriceMinor = 2200 }] }],
        }));
        OnboardingMenuItemDto dish = state.Menu.Categories[0].Items[0];
        await _h.InDbAsync(async db =>
        {
            MenuItem item = await db.MenuItems.FirstAsync(i => i.Id == dish.Id);
            item.Allergens = Allergens.Gluten | Allergens.Milk;
            item.DietaryTags = DietaryTags.Vegetarian;
            item.Availability = MenuItemAvailability.SoldOut;
            await db.SaveChangesAsync();
        });

        await AsAsync(c.User, s => s.SaveMenuAsync(c.RestaurantId, new SaveOnboardingMenuRequest
        {
            Categories = [new OnboardingMenuCategoryDto { Id = state.Menu.Categories[0].Id, Name = "Plats", Items = [new OnboardingMenuItemDto { Id = dish.Id, Name = "Carbonade flamande", PriceMinor = 2300 }] }],
        }));

        MenuItem stored = await _h.InDbAsync(db => db.MenuItems.AsNoTracking().FirstAsync(i => i.Id == dish.Id));
        Assert.Equal("Carbonade flamande", stored.Name);
        Assert.Equal(Allergens.Gluten | Allergens.Milk, stored.Allergens);
        Assert.Equal(DietaryTags.Vegetarian, stored.DietaryTags);
        Assert.Equal(MenuItemAvailability.SoldOut, stored.Availability);
    }

    [Fact]
    public async Task SaveMenu_StoresADishsAllergensAndDiets_AndReadsThemBack()
    {
        Caller c = await RunningAsync();

        OnboardingStateDto state = await AsAsync(c.User, s => s.SaveMenuAsync(c.RestaurantId, new SaveOnboardingMenuRequest
        {
            Categories = [new OnboardingMenuCategoryDto
            {
                Name = "Plats",
                Items = [new OnboardingMenuItemDto { Name = "Croquettes", PriceMinor = 1450, Allergens = ["Crustaceans", "Gluten"], DietaryTags = [] }],
            }],
        }));

        OnboardingMenuItemDto read = state.Menu.Categories[0].Items[0];
        Assert.Equal(["Gluten", "Crustaceans"], read.Allergens);
        Assert.Empty(read.DietaryTags!);
        MenuItem stored = await _h.InDbAsync(db => db.MenuItems.AsNoTracking().FirstAsync(i => i.Id == read.Id));
        Assert.Equal(Allergens.Gluten | Allergens.Crustaceans, stored.Allergens);
    }

    [Fact]
    public async Task SaveMenu_ADishSavedWithAnEmptyListLosesItsAllergens_AndOneSavedWithNullKeepsThem()
    {
        Caller c = await RunningAsync();
        OnboardingStateDto state = await AsAsync(c.User, s => s.SaveMenuAsync(c.RestaurantId, new SaveOnboardingMenuRequest
        {
            Categories = [new OnboardingMenuCategoryDto
            {
                Name = "Plats",
                Items =
                [
                    new OnboardingMenuItemDto { Name = "Carbonade", Allergens = ["Celery"], DietaryTags = ["GlutenFree"] },
                    new OnboardingMenuItemDto { Name = "Waterzooi", Allergens = ["Fish"] },
                ],
            }],
        }));
        OnboardingMenuCategoryDto category = state.Menu.Categories[0];

        await AsAsync(c.User, s => s.SaveMenuAsync(c.RestaurantId, new SaveOnboardingMenuRequest
        {
            Categories = [new OnboardingMenuCategoryDto
            {
                Id = category.Id,
                Name = "Plats",
                Items =
                [
                    new OnboardingMenuItemDto { Id = category.Items[0].Id, Name = "Carbonade", Allergens = [], DietaryTags = null },
                    new OnboardingMenuItemDto { Id = category.Items[1].Id, Name = "Waterzooi" },
                ],
            }],
        }));

        MenuItem cleared = await _h.InDbAsync(db => db.MenuItems.AsNoTracking().FirstAsync(i => i.Id == category.Items[0].Id));
        MenuItem kept = await _h.InDbAsync(db => db.MenuItems.AsNoTracking().FirstAsync(i => i.Id == category.Items[1].Id));
        Assert.Equal(Allergens.None, cleared.Allergens);
        Assert.Equal(DietaryTags.GlutenFree, cleared.DietaryTags);
        Assert.Equal(Allergens.Fish, kept.Allergens);
    }

    [Theory]
    [InlineData("Peanut", null)]
    [InlineData("1", null)]
    [InlineData(null, "Pescatarian")]
    public async Task SaveMenu_RefusesAnUnknownAllergenOrDiet_AndStoresNothing(string? allergen, string? diet)
    {
        Caller c = await RunningAsync();

        OpenRestoException refused = await Refused<ValidationException>(AsAsync(c.User, s => s.SaveMenuAsync(c.RestaurantId, new SaveOnboardingMenuRequest
        {
            Categories = [new OnboardingMenuCategoryDto
            {
                Name = "Plats",
                Items = [new OnboardingMenuItemDto { Name = "Croquettes", Allergens = allergen is null ? null : [allergen], DietaryTags = diet is null ? null : [diet] }],
            }],
        })));

        Assert.Equal(ErrorCodes.OnboardingMenuInvalid, refused.Code);
        Assert.Equal(0, await _h.InDbAsync(db => db.Menus.CountAsync(m => m.RestaurantId == c.RestaurantId)));
    }

    [Theory]
    [InlineData("", "Croquettes", 100L)]
    [InlineData("Entrées", "  ", 100L)]
    [InlineData("Entrées", "Croquettes", -1L)]
    public async Task SaveMenu_RefusesABlankNameOrANegativePrice_AndStoresNothing(string category, string dish, long price)
    {
        Caller c = await RunningAsync();

        OpenRestoException refused = await Refused<ValidationException>(AsAsync(c.User, s => s.SaveMenuAsync(c.RestaurantId, new SaveOnboardingMenuRequest
        {
            Categories = [new OnboardingMenuCategoryDto { Name = category, Items = [new OnboardingMenuItemDto { Name = dish, PriceMinor = price }] }],
        })));

        Assert.Equal(ErrorCodes.OnboardingMenuInvalid, refused.Code);
        Assert.Equal(0, await _h.InDbAsync(db => db.Menus.CountAsync(m => m.RestaurantId == c.RestaurantId)));
        Assert.Null((await StoredAsync(c.RestaurantId)).OnboardingSteps);
    }

    [Fact]
    public async Task SaveMenu_RefusesACategoryIdFromAnotherRestaurant()
    {
        Caller c = await RunningAsync();
        Caller other = await RunningAsync();
        OnboardingStateDto theirs = await AsAsync(other.User, s => s.SaveMenuAsync(other.RestaurantId, new SaveOnboardingMenuRequest
        {
            Categories = [new OnboardingMenuCategoryDto { Name = "Secrète", Items = [new OnboardingMenuItemDto { Name = "Plat secret", PriceMinor = 1 }] }],
        }));

        OpenRestoException refused = await Refused<ValidationException>(AsAsync(c.User, s => s.SaveMenuAsync(c.RestaurantId, new SaveOnboardingMenuRequest
        {
            Categories = [new OnboardingMenuCategoryDto { Id = theirs.Menu.Categories[0].Id, Name = "Volée", Items = [] }],
        })));

        Assert.Equal(ErrorCodes.OnboardingMenuInvalid, refused.Code);
        Assert.Equal("Secrète", (await _h.InDbAsync(db => db.MenuCategories.AsNoTracking().FirstAsync(x => x.Id == theirs.Menu.Categories[0].Id))).Name);
    }

    // ── Step 5 ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task SaveBranding_StoresTheThemeColourAndTagline_AndBlankGoesBackToTheInstanceColour()
    {
        Caller c = await RunningAsync();

        OnboardingStateDto saved = await AsAsync(c.User, s => s.SaveBrandingAsync(c.RestaurantId,
            new SaveOnboardingBrandingRequest { Theme = "Gastronomique", PrimaryColor = "#7A1F2B", Tagline = "Cuisine belge" }));

        Assert.Equal("Gastronomique", saved.Branding.Theme);
        Assert.Equal("#7a1f2b", saved.Branding.PrimaryColor);
        Assert.Equal("Cuisine belge", saved.Branding.Tagline);
        Assert.Equal("Done", saved.Steps.Single(x => x.Key == "branding").State);

        OnboardingStateDto cleared = await AsAsync(c.User, s => s.SaveBrandingAsync(c.RestaurantId,
            new SaveOnboardingBrandingRequest { Theme = "Cafe", PrimaryColor = "" }));

        Assert.Null(cleared.Branding.PrimaryColor);
        Assert.Equal("Cafe", cleared.Branding.Theme);
    }

    [Theory]
    [InlineData("red")]
    [InlineData("#fff")]
    [InlineData("#12345678")]
    [InlineData("url(javascript:alert(1))")]
    public async Task SaveBranding_RefusesAColourThatIsNotRrggbb_AndKeepsTheOldOne(string color)
    {
        Caller c = await RunningAsync();
        await AsAsync(c.User, s => s.SaveBrandingAsync(c.RestaurantId, new SaveOnboardingBrandingRequest { Theme = "Brasserie", PrimaryColor = "#112233" }));

        OpenRestoException refused = await Refused<ValidationException>(AsAsync(c.User, s => s.SaveBrandingAsync(c.RestaurantId,
            new SaveOnboardingBrandingRequest { Theme = "Cafe", PrimaryColor = color })));

        Assert.Equal(ErrorCodes.SiteColorInvalid, refused.Code);
        OnboardingStateDto state = await AsAsync(c.User, s => s.GetStateAsync(c.RestaurantId));
        Assert.Equal("#112233", state.Branding.PrimaryColor);
        Assert.Equal("Brasserie", state.Branding.Theme);
    }

    [Fact]
    public async Task SaveBranding_KeepsTheLegalIdentityStepOneWrote()
    {
        Caller c = await RunningAsync();
        await AsAsync(c.User, s => s.SaveInfoAsync(c.RestaurantId, InfoRequest()));

        await AsAsync(c.User, s => s.SaveBrandingAsync(c.RestaurantId, new SaveOnboardingBrandingRequest { Theme = "Cafe" }));

        RestaurantSite site = await _h.InDbAsync(db => db.RestaurantSites.AsNoTracking().FirstAsync(x => x.RestaurantId == c.RestaurantId));
        Assert.Equal("Senne Dorée SRL", site.LegalName);
        Assert.Equal(ValidCompanyNumber, site.CompanyNumber);
    }

    // ── Skipping ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task SkipStep_SkipsAnOptionalStep_AndRefusesARequiredOne()
    {
        Caller c = await RunningAsync();

        OnboardingStateDto skipped = await AsAsync(c.User, s => s.SkipStepAsync(c.RestaurantId, "menu"));
        OpenRestoException info = await Refused<BusinessRuleException>(AsAsync(c.User, s => s.SkipStepAsync(c.RestaurantId, "info")));
        OpenRestoException layout = await Refused<BusinessRuleException>(AsAsync(c.User, s => s.SkipStepAsync(c.RestaurantId, "layout")));
        OpenRestoException unknown = await Refused<ValidationException>(AsAsync(c.User, s => s.SkipStepAsync(c.RestaurantId, "gifts")));

        Assert.Equal("Skipped", skipped.Steps.Single(x => x.Key == "menu").State);
        Assert.Equal(ErrorCodes.OnboardingStepRequired, info.Code);
        Assert.Equal(ErrorCodes.OnboardingStepRequired, layout.Code);
        Assert.Equal(ErrorCodes.OnboardingStepUnknown, unknown.Code);
        Assert.Equal("Todo", (await AsAsync(c.User, s => s.GetStateAsync(c.RestaurantId))).Steps.Single(x => x.Key == "info").State);
    }

    [Fact]
    public async Task SkipStep_DoesNotUndoAStepAlreadyDone()
    {
        Caller c = await RunningAsync();
        await AsAsync(c.User, s => s.SaveBrandingAsync(c.RestaurantId, new SaveOnboardingBrandingRequest { Theme = "Cafe" }));

        OnboardingStateDto state = await AsAsync(c.User, s => s.SkipStepAsync(c.RestaurantId, "branding"));

        Assert.Equal("Done", state.Steps.Single(x => x.Key == "branding").State);
    }

    [Fact]
    public async Task Resume_LandsOnTheFirstStepStillToDo_AtAnyTime()
    {
        Caller c = await RunningAsync();
        Assert.Equal("info", (await AsAsync(c.User, s => s.GetStateAsync(c.RestaurantId))).NextStep);

        await AsAsync(c.User, s => s.SaveInfoAsync(c.RestaurantId, InfoRequest()));
        Assert.Equal("hours", (await AsAsync(c.User, s => s.GetStateAsync(c.RestaurantId))).NextStep);

        await AsAsync(c.User, s => s.SaveLayoutAsync(c.RestaurantId, LayoutRequest()));
        Assert.Equal("hours", (await AsAsync(c.User, s => s.GetStateAsync(c.RestaurantId))).NextStep);

        await AsAsync(c.User, s => s.SaveHoursAsync(c.RestaurantId, HoursRequest()));
        await AsAsync(c.User, s => s.SkipStepAsync(c.RestaurantId, "menu"));
        OnboardingStateDto state = await AsAsync(c.User, s => s.GetStateAsync(c.RestaurantId));
        Assert.Equal("branding", state.NextStep);

        await AsAsync(c.User, s => s.SkipStepAsync(c.RestaurantId, "branding"));
        Assert.Null((await AsAsync(c.User, s => s.GetStateAsync(c.RestaurantId))).NextStep);
    }

    // ── Publishing ───────────────────────────────────────────────────────────

    [Fact]
    public async Task Publish_GoesLive_WhenTheRequiredStepsAreDone()
    {
        Caller c = await RunningAsync();
        OnboardingStateDto ready = await ReadyToPublishAsync(c);
        await AsAsync(c.User, s => s.SaveMenuAsync(c.RestaurantId, new SaveOnboardingMenuRequest
        {
            Categories = [new OnboardingMenuCategoryDto { Name = "Plats", Items = [new OnboardingMenuItemDto { Name = "Carbonade", PriceMinor = 2200 }] }],
        }));
        Assert.True(ready.CanPublish);
        Assert.Empty(ready.PublishBlockers);
        Assert.Null(ready.Links.BookingPath);

        OnboardingStateDto live = await AsAsync(c.User, s => s.PublishAsync(c.RestaurantId));

        Assert.Equal("Published", live.Status);
        Assert.Equal($"/locations/{c.RestaurantId}", live.Links.BookingPath);
        string slug = await _h.InDbAsync(async db => (await db.RestaurantSites.FirstAsync(x => x.RestaurantId == c.RestaurantId)).Slug);
        Assert.StartsWith("brasserie-de-la-senne", slug);
        Assert.Equal($"/r/{slug}", live.Links.SitePath);
        Assert.StartsWith("/menu/r/", live.Links.MenuPath);
        Restaurant stored = await StoredAsync(c.RestaurantId);
        Assert.Equal(RestaurantStatus.Published, stored.Status);
        Assert.NotNull(stored.PublishedAt);
        Assert.True(await _h.InDbAsync(db => db.RestaurantSites.AnyAsync(x => x.RestaurantId == c.RestaurantId && x.IsPublished)));
        Assert.True(await _h.InDbAsync(db => db.Menus.AllAsync(m => m.RestaurantId != c.RestaurantId || m.IsPublished)));
    }

    [Fact]
    public async Task Publish_IsRefusedUntilTheRequiredStepsAreDone_AndNothingGoesLive()
    {
        Caller c = await RunningAsync();
        await AsAsync(c.User, s => s.SaveInfoAsync(c.RestaurantId, InfoRequest()));
        await AsAsync(c.User, s => s.SaveHoursAsync(c.RestaurantId, HoursRequest()));

        OpenRestoException refused = await Refused<BusinessRuleException>(AsAsync(c.User, s => s.PublishAsync(c.RestaurantId)));

        Assert.Equal(ErrorCodes.OnboardingNotPublishable, refused.Code);
        Assert.Equal("layout", refused.Args!["steps"]);
        Restaurant stored = await StoredAsync(c.RestaurantId);
        Assert.Equal(RestaurantStatus.Draft, stored.Status);
        Assert.Null(stored.PublishedAt);
        Assert.False(await _h.InDbAsync(db => db.RestaurantSites.AnyAsync(x => x.RestaurantId == c.RestaurantId && x.IsPublished)));
        OnboardingStateDto state = await AsAsync(c.User, s => s.GetStateAsync(c.RestaurantId));
        Assert.False(state.CanPublish);
        Assert.Equal(["layout"], state.PublishBlockers);
    }

    [Fact]
    public async Task Publish_DoesNotCountASkippedRequiredStep()
    {
        Caller c = await RunningAsync();
        await ReadyToPublishAsync(c);
        await _h.InDbAsync(async db =>
        {
            Restaurant r = await db.Restaurants.FirstAsync(x => x.Id == c.RestaurantId);
            r.OnboardingSteps = OnboardingProgress.Mark(r.OnboardingSteps, OnboardingStep.Hours, OnboardingStepState.Skipped);
            await db.SaveChangesAsync();
        });

        OpenRestoException refused = await Refused<BusinessRuleException>(AsAsync(c.User, s => s.PublishAsync(c.RestaurantId)));

        Assert.Equal(ErrorCodes.OnboardingNotPublishable, refused.Code);
        Assert.Equal("hours", refused.Args!["steps"]);
    }

    [Fact]
    public async Task Publish_IsRefusedOnASuspendedRestaurant()
    {
        Caller c = await RunningAsync();
        await ReadyToPublishAsync(c);
        (await _h.Operator().PostAsJsonAsync($"/api/platform/restaurants/{c.RestaurantId}/suspend", new { reason = "Contrôle" })).EnsureSuccessStatusCode();

        OpenRestoException refused = await Refused<ConflictException>(AsAsync(c.User, s => s.PublishAsync(c.RestaurantId)));

        Assert.Equal(ErrorCodes.OnboardingSuspended, refused.Code);
        Assert.Equal(RestaurantStatus.Suspended, (await StoredAsync(c.RestaurantId)).Status);
    }

    [Fact]
    public async Task ASuspendedRestaurant_TakesNoWrite_ButCanStillBeRead()
    {
        Caller c = await RunningAsync();
        (await _h.Operator().PostAsJsonAsync($"/api/platform/restaurants/{c.RestaurantId}/suspend", new { reason = "Mise en conformité" })).EnsureSuccessStatusCode();

        OnboardingStateDto state = await AsAsync(c.User, s => s.GetStateAsync(c.RestaurantId));
        Assert.Equal("Suspended", state.Status);
        Assert.Equal("Mise en conformité", state.SuspensionReason);
        Assert.False(state.CanPublish);

        var writes = new Func<OnboardingService, Task>[]
        {
            s => s.SaveInfoAsync(c.RestaurantId, InfoRequest()),
            s => s.SaveHoursAsync(c.RestaurantId, HoursRequest()),
            s => s.SaveLayoutAsync(c.RestaurantId, LayoutRequest()),
            s => s.SaveMenuAsync(c.RestaurantId, new SaveOnboardingMenuRequest { Categories = [] }),
            s => s.SaveBrandingAsync(c.RestaurantId, new SaveOnboardingBrandingRequest { Theme = "Cafe" }),
            s => s.SkipStepAsync(c.RestaurantId, "menu"),
            s => s.UnpublishAsync(c.RestaurantId),
        };
        foreach (Func<OnboardingService, Task> write in writes)
        {
            OpenRestoException refused = await Assert.ThrowsAsync<ConflictException>(() => AsAsync(c.User, async s => { await write(s); return 0; }));
            Assert.Equal(ErrorCodes.OnboardingSuspended, refused.Code);
        }

        Restaurant stored = await StoredAsync(c.RestaurantId);
        Assert.Null(stored.OnboardingSteps);
        Assert.Equal(RestaurantStatus.Suspended, stored.Status);
    }

    [Fact]
    public async Task Unpublish_ReturnsToADraft_SoALaterReactivationDoesNotBringItBackLive()
    {
        Caller c = await RunningAsync();
        await ReadyToPublishAsync(c);
        await AsAsync(c.User, s => s.PublishAsync(c.RestaurantId));

        OnboardingStateDto draft = await AsAsync(c.User, s => s.UnpublishAsync(c.RestaurantId));

        Assert.Equal("Draft", draft.Status);
        Assert.Null(draft.Links.BookingPath);
        Assert.Null((await StoredAsync(c.RestaurantId)).PublishedAt);

        (await _h.Operator().PostAsJsonAsync($"/api/platform/restaurants/{c.RestaurantId}/suspend", new { })).EnsureSuccessStatusCode();
        (await _h.Operator().PostAsync($"/api/platform/restaurants/{c.RestaurantId}/reactivate", null)).EnsureSuccessStatusCode();
        Assert.Equal(RestaurantStatus.Draft, (await StoredAsync(c.RestaurantId)).Status);
    }

    // ── Preview ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Preview_ShowsWhatAGuestWillMeet_BeforeAnythingIsPublished()
    {
        Caller c = await RunningAsync();
        await ReadyToPublishAsync(c);
        await AsAsync(c.User, s => s.SaveBrandingAsync(c.RestaurantId, new SaveOnboardingBrandingRequest { Theme = "Cafe", PrimaryColor = "#445566", Tagline = "Ici" }));

        OnboardingPreviewDto preview = await AsAsync(c.User, s => s.GetPreviewAsync(c.RestaurantId));

        Assert.Equal("Brasserie de la Senne", preview.RestaurantName);
        Assert.Equal(2, preview.TableCount);
        Assert.Equal(6, preview.LargestParty);
        Assert.Equal([2, 6], preview.OpenHours.Select(d => d.Day));
        Assert.Equal("#445566", preview.PrimaryColor);
        Assert.Equal("Ici", preview.Tagline);
        Assert.NotEmpty(preview.SampleSlots);
        Assert.All(preview.SampleSlots, slot => Assert.Matches(@"^\d{2}:\d{2}$", slot));
        Assert.Equal(30, preview.SlotIntervalMinutes);
        Assert.Equal(90, preview.BookingDurationMinutes);

        RenderedSitePage site = await AsAsync(c.User, s => s.PreviewSiteAsync(c.RestaurantId, null));
        Assert.Contains("Brasserie de la Senne", site.Html);
        Assert.Contains("noindex", site.Html);
    }

    [Fact]
    public async Task Preview_OfAFreshRestaurant_HasNoSlotsAndNoTables_NotAnError()
    {
        Caller c = await RunningAsync();

        OnboardingPreviewDto preview = await AsAsync(c.User, s => s.GetPreviewAsync(c.RestaurantId));

        Assert.Equal(0, preview.TableCount);
        Assert.Equal(0, preview.LargestParty);
    }
}
