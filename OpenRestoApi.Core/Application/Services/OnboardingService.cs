using System.Globalization;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Legal;
using OpenRestoApi.Core.Application.Site;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Services;

/// <summary>
/// Everything a restaurateur does before their restaurant is live: accepting the invitation, the
/// five setup steps, the previews, publishing. It composes the services the admin already uses
/// (sections and tables, menus, the site) rather than copying them, and puts one gate in front of
/// all of them: <see cref="RequireRestaurantAsync"/>. A restaurant the caller does not run is a
/// 404, indistinguishable from one that does not exist, and a suspended one takes no writes.
/// </summary>
/// <seealso>OnboardingServiceTests.AnotherRestaurantsId_IsANotFound_ForEveryOperation</seealso>
public class OnboardingService(
    IPlatformRepository repository,
    IAdminCredentialRepository credentials,
    IPasswordService passwordService,
    IJwtTokenService jwtTokenService,
    ICurrentUserService currentUser,
    RestaurantManagementService restaurants,
    MenuService menus,
    SiteService sites,
    BrandService brandService,
    ISystemClock clock,
    IAuditScope? audit = null)
{
    private readonly IPlatformRepository _repo = repository;
    private readonly IAdminCredentialRepository _credentials = credentials;
    private readonly IPasswordService _passwords = passwordService;
    private readonly IJwtTokenService _jwt = jwtTokenService;
    private readonly ICurrentUserService _currentUser = currentUser;
    private readonly RestaurantManagementService _restaurants = restaurants;
    private readonly MenuService _menus = menus;
    private readonly SiteService _sites = sites;
    private readonly BrandService _brand = brandService;
    private readonly ISystemClock _clock = clock;
    private readonly IAuditScope _audit = audit ?? NullAuditScope.Instance;

    /// <summary>A restaurateur's account is out on the internet; the admin's 6 characters are not enough.</summary>
    public const int MinPasswordLength = 10;

    private const int PreviewSlotCount = 8;

    // ── Invitation (anonymous) ───────────────────────────────────────────────

    public async Task<InvitationPreviewDto> GetInvitationAsync(string token)
    {
        RestaurantInvitation invitation = await RequirePendingInvitationAsync(token);
        return new InvitationPreviewDto
        {
            RestaurantName = invitation.Restaurant!.Name,
            Email = invitation.Email,
            Locale = invitation.Locale,
            ExpiresAt = invitation.ExpiresAt,
            Documents = [.. LegalCatalog.AcceptedAtSignUp.Select(d => new LegalDocumentRefDto { Key = d.Key, Version = d.Version })],
        };
    }

    /// <summary>
    /// Creates the account, links it to the restaurant, journals what was accepted and signs the
    /// restaurateur in. An invitation to a restaurant whose account already exists sets a new
    /// password instead: that is how a restaurateur who lost theirs comes back.
    /// </summary>
    /// <seealso>OnboardingServiceTests.AcceptInvitation_CreatesTheAccount_JournalsTheConsent_AndSignsIn</seealso>
    /// <seealso>OnboardingServiceTests.AcceptInvitation_RefusesWithoutEveryDocument_AndCreatesNothing</seealso>
    /// <seealso>OnboardingServiceTests.AcceptInvitation_RefusesAnOutdatedVersion_AndCreatesNothing</seealso>
    public async Task<AcceptedInvitation> AcceptInvitationAsync(string token, AcceptInvitationRequest req)
    {
        RestaurantInvitation invitation = await RequirePendingInvitationAsync(token);
        RequireCurrentConsent(req.AcceptedDocuments);
        RequirePassword(req.Password);

        DateTime now = _clock.UtcNow;
        AdminCredential? existing = await _credentials.GetByEmailAsync(invitation.Email);
        AdminCredential account;
        if (existing is null)
        {
            (string hash, string salt) = _passwords.Hash(req.Password);
            account = await _credentials.AddAsync(new AdminCredential
            {
                Email = invitation.Email,
                PasswordHash = hash,
                PasswordSalt = salt,
                DisplayName = UserFields.NormalizeDisplayName(req.DisplayName),
                Role = UserRoles.Restaurateur,
                IsActive = true,
                CreatedAt = now,
            });
            _repo.AddMember(new RestaurantMember { UserId = account.Id, RestaurantId = invitation.RestaurantId, CreatedAt = now });
        }
        else if (existing.IsActive
            && existing.Role == UserRoles.Restaurateur
            && await _repo.FindMemberRestaurantAsync(existing.Id, invitation.RestaurantId) is not null)
        {
            account = existing;
            (account.PasswordHash, account.PasswordSalt) = _passwords.Hash(req.Password);
            account.RevokeSessions();
        }
        else
        {
            // An address that belongs to someone else's account cannot be claimed by a link.
            throw InvalidInvitation();
        }

        foreach (LegalDocument document in LegalCatalog.AcceptedAtSignUp)
        {
            _repo.AddAcceptance(new LegalAcceptance
            {
                UserId = account.Id,
                RestaurantId = invitation.RestaurantId,
                Email = account.Email,
                DocumentKey = document.Key,
                Version = document.Version,
                ContentSha256 = document.ContentSha256,
                AcceptedAt = now,
            });
        }

        invitation.AcceptedAt = now;
        invitation.AcceptedByUserId = account.Id;
        account.LastLoginAt = now;
        await _repo.SaveChangesAsync();

        _audit.AttributeTo(account.Id, account.Email, account.DisplayName, account.Role);
        _audit.Describe(AuditActions.OnboardingInvitationAccept, AuditTargets.Restaurant,
            AuditTargets.IdOf(invitation.RestaurantId), invitation.Restaurant!.Name, invitation.RestaurantId,
            $"Accepted the invitation to \"{invitation.Restaurant.Name}\" and the legal documents");

        return new AcceptedInvitation(
            _jwt.Generate(account.Id, account.Email, account.Role, account.SessionVersion),
            invitation.RestaurantId);
    }

    // ── Reading ──────────────────────────────────────────────────────────────

    public async Task<OnboardingMeDto> GetMeAsync()
    {
        int userId = RequireUserId();
        AdminCredential account = await _credentials.GetByIdAsync(userId) ?? throw RestaurantNotFound();
        List<Restaurant> mine = await _repo.GetMemberRestaurantsAsync(userId);
        return new OnboardingMeDto
        {
            Email = account.Email,
            DisplayName = account.DisplayName,
            Restaurants = [.. mine.Where(r => !r.IsArchived).Select(r => new OnboardingRestaurantSummaryDto
            {
                Id = r.Id,
                Name = r.Name,
                Status = r.Status.ToString(),
            })],
        };
    }

    public async Task<OnboardingStateDto> GetStateAsync(int restaurantId)
        => await BuildStateAsync(await RequireRestaurantAsync(restaurantId, forWrite: false));

    public async Task<RestaurantInboxDto> GetInboxAsync(int restaurantId)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId, forWrite: false);
        List<Booking> bookings = await _repo.GetInboxBookingsAsync(restaurantId);
        return new(restaurant.Timezone, [.. bookings.Select(b => new RestaurantInboxBookingDto(
            b.Id, b.Date, b.BookingRef, b.CustomerName, b.CustomerEmail, b.Seats, b.SpecialRequests, b.IsCancelled))]);
    }

    public async Task CheckMenuImportAsync(int restaurantId) => _ = await RequireRestaurantAsync(restaurantId);

    public async Task<SaveOnboardingMenuRequest> ImportMenuAsync(int restaurantId, string text, string language)
    {
        await CheckMenuImportAsync(restaurantId);
        return MenuImport.Propose(text, language);
    }

    public async Task<OnboardingPreviewDto> GetPreviewAsync(int restaurantId)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId, forWrite: false);
        OnboardingStateDto state = await BuildStateAsync(restaurant);
        List<DayHoursDto> open = OpenWeek(restaurant);
        List<Section> sections = await _repo.GetSectionsWithTablesAsync(restaurantId);
        List<Table> tables = [.. sections.SelectMany(s => s.Tables)];

        return new OnboardingPreviewDto
        {
            RestaurantName = restaurant.Name,
            Address = restaurant.Address,
            PhoneNumber = restaurant.PhoneNumber,
            OpenHours = open,
            TableCount = tables.Count,
            LargestParty = tables.Count == 0 ? 0 : tables.Max(t => t.Seats),
            SlotIntervalMinutes = restaurant.BookingSlotIntervalMinutes,
            BookingDurationMinutes = restaurant.DefaultBookingDurationMinutes,
            SampleSlots = SampleSlots(restaurant, open),
            Menu = state.Menu,
            PrimaryColor = state.Branding.PrimaryColor ?? (await _brand.GetAsync()).PrimaryColor,
            LogoUrl = state.Branding.LogoUrl,
            Tagline = state.Branding.Tagline,
        };
    }

    /// <summary>The website as it renders now, for the frame in step 5.</summary>
    public async Task<RenderedSitePage> PreviewSiteAsync(int restaurantId, string? theme)
    {
        await RequireRestaurantAsync(restaurantId, forWrite: false);
        return await _sites.PreviewAsync(restaurantId, theme);
    }

    // ── Step 1: the restaurant ───────────────────────────────────────────────

    /// <seealso>OnboardingServiceTests.SaveInfo_StoresTheRestaurantAndTheLegalIdentity_AndMarksTheStepDone</seealso>
    /// <seealso>OnboardingServiceTests.SaveInfo_RefusesAnInvalidCompanyNumber_AndWritesNothing</seealso>
    public async Task<OnboardingStateDto> SaveInfoAsync(int restaurantId, SaveOnboardingInfoRequest req)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId);

        string name = Required(req.Name, ErrorCodes.OnboardingNameRequired);
        string address = Required(req.Address, ErrorCodes.OnboardingAddressRequired);
        string phone = OnboardingFields.NormalizePhone(req.PhoneNumber);
        string email = ContactFields.NormalizeEmail(req.EmailAddress)
            ?? throw new ValidationException("A contact email address is required.") { Code = ErrorCodes.OnboardingEmailRequired };
        string legalName = Required(req.LegalName, ErrorCodes.OnboardingLegalNameRequired);
        string companyNumber = BelgianBusinessNumber.NormalizeCompanyNumber(req.CompanyNumber, ErrorCodes.OnboardingCompanyNumberInvalid)
            ?? throw new ValidationException("The company number is required.") { Code = ErrorCodes.OnboardingCompanyNumberRequired };
        string? vat = BelgianBusinessNumber.NormalizeVat(req.VatNumber, ErrorCodes.OnboardingVatInvalid);
        int retention = req.BookingRetentionMonths ?? restaurant.BookingRetentionMonths ?? BookingRetention.DefaultMonths;
        if (!BookingRetention.IsValid(retention))
        {
            throw new ValidationException("The retention period must be between 1 and 60 months.")
            {
                Code = ErrorCodes.OnboardingRetentionInvalid,
                Args = new Dictionary<string, object> { ["min"] = BookingRetention.MinMonths, ["max"] = BookingRetention.MaxMonths },
            };
        }

        _audit.RecordChange("name", restaurant.Name, name);
        _audit.RecordChange("address", restaurant.Address, address);
        _audit.RecordChange("vatNumber", restaurant.VatNumber, vat);
        _audit.RecordChange("bookingRetentionMonths", restaurant.BookingRetentionMonths, retention);
        restaurant.Name = name;
        restaurant.Address = address;
        restaurant.PhoneNumber = phone;
        restaurant.EmailAddress = email;
        restaurant.VatNumber = vat;
        restaurant.BookingRetentionMonths = retention;
        MarkStep(restaurant, OnboardingStep.Info, OnboardingStepState.Done);
        await _repo.SaveChangesAsync();

        // The legal notice of the website carries the same identity, so it is written from the
        // same input rather than asked for twice.
        SiteDto site = await _sites.GetAsync(restaurantId);
        await _sites.UpdateAsync(restaurantId, SiteRequestFrom(site, legal: new SiteLegalDto
        {
            Name = legalName,
            CompanyNumber = companyNumber,
            VatNumber = vat,
            Address = address,
        }));

        Describe(restaurant, "Saved the restaurant details");
        return await BuildStateAsync(restaurant);
    }

    // ── Step 2: opening hours ────────────────────────────────────────────────

    /// <seealso>OnboardingServiceTests.SaveHours_SetsTheOpenDaysAndTheirHours</seealso>
    /// <seealso>OnboardingServiceTests.SaveHours_RefusesAWeekWithNoOpenDay_AndWritesNothing</seealso>
    public async Task<OnboardingStateDto> SaveHoursAsync(int restaurantId, SaveOnboardingHoursRequest req)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId);

        List<DayHoursDto> days = req.OpenHours ?? [];
        if (days.Count == 0)
        {
            throw new ValidationException("At least one open day is required.") { Code = ErrorCodes.OnboardingHoursNoOpenDay };
        }

        // Validates the days and times, and collapses a uniform week; a failure here throws
        // before anything below is assigned.
        OpeningHoursHelper.ApplyOpenHours(restaurant, days);
        restaurant.OpenDays = string.Join(',', days.Select(d => d.Day).Distinct().Order());

        if (req.DefaultBookingDurationMinutes is { } duration)
        {
            if (!BookingDuration.AllowedMinutes.Contains(duration))
            {
                throw new ValidationException(
                    $"DefaultBookingDurationMinutes must be one of: {string.Join(", ", BookingDuration.AllowedMinutes.Order())}.")
                {
                    Code = ErrorCodes.RestaurantDurationInvalid,
                    Args = new Dictionary<string, object> { ["allowed"] = string.Join(", ", BookingDuration.AllowedMinutes.Order()) },
                };
            }

            restaurant.DefaultBookingDurationMinutes = duration;
        }

        MarkStep(restaurant, OnboardingStep.Hours, OnboardingStepState.Done);
        await _repo.SaveChangesAsync();

        Describe(restaurant, "Saved the opening hours");
        return await BuildStateAsync(restaurant);
    }

    // ── Step 3: rooms and tables ─────────────────────────────────────────────

    /// <summary>
    /// Replaces the layout with the one sent. What is missing from it is removed — but a table or a
    /// room that an upcoming booking sits at is not: that is refused, whole, before anything
    /// changes, because removing it would strip the booking of its table.
    /// </summary>
    /// <seealso>OnboardingServiceTests.SaveLayout_AddsRenamesAndRemoves_AndKeepsTheIdsItWasGiven</seealso>
    /// <seealso>OnboardingServiceTests.SaveLayout_RefusesToRemoveATableWithAnUpcomingBooking_AndChangesNothing</seealso>
    public async Task<OnboardingStateDto> SaveLayoutAsync(int restaurantId, SaveOnboardingLayoutRequest req)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId);
        List<OnboardingSectionDto> wanted = req.Sections ?? [];
        ValidateLayout(wanted);

        List<Section> current = await _repo.GetSectionsWithTablesAsync(restaurantId);
        HashSet<int> keptSections = [.. wanted.Where(s => s.Id.HasValue).Select(s => s.Id!.Value)];
        HashSet<int> keptTables = [.. wanted.SelectMany(s => s.Tables).Where(t => t.Id.HasValue).Select(t => t.Id!.Value)];
        RejectUnknownIds(current, keptSections, keptTables);

        // Check every removal first so a refusal leaves the layout exactly as it was.
        foreach (Section section in current)
        {
            if (!keptSections.Contains(section.Id))
            {
                await RejectIfInUseAsync(await _restaurants.GetSectionDeleteImpactAsync(restaurantId, section.Id));
                continue;
            }

            foreach (Table table in section.Tables.Where(t => !keptTables.Contains(t.Id)))
            {
                await RejectIfInUseAsync(await _restaurants.GetTableDeleteImpactAsync(restaurantId, section.Id, table.Id));
            }
        }

        foreach (Section section in current.Where(s => !keptSections.Contains(s.Id)))
        {
            await _restaurants.DeleteSectionAsync(restaurantId, section.Id);
        }

        foreach (OnboardingSectionDto wantedSection in wanted)
        {
            int sectionId = await UpsertSectionAsync(restaurantId, current, wantedSection);
            // Materialised: deleting a table edits the very collection being walked.
            foreach (Table gone in current.FirstOrDefault(s => s.Id == sectionId)?.Tables.Where(t => !keptTables.Contains(t.Id)).ToList() ?? [])
            {
                await _restaurants.DeleteTableAsync(restaurantId, sectionId, gone.Id);
            }

            foreach (OnboardingTableDto table in wantedSection.Tables)
            {
                await UpsertTableAsync(restaurantId, sectionId, table);
            }
        }

        MarkStep(restaurant, OnboardingStep.Layout, OnboardingStepState.Done);
        await _repo.SaveChangesAsync();

        Describe(restaurant, "Saved the rooms and tables");
        return await BuildStateAsync(restaurant);
    }

    // ── Step 4: the first menu ───────────────────────────────────────────────

    /// <seealso>OnboardingServiceTests.SaveMenu_BuildsTheFirstMenu_AndUpdatesItInPlace</seealso>
    public async Task<OnboardingStateDto> SaveMenuAsync(int restaurantId, SaveOnboardingMenuRequest req)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId);
        List<OnboardingMenuCategoryDto> categories = req.Categories ?? [];
        ValidateMenu(categories);

        MenuDto? menu = (await _menus.GetMenusAsync(restaurantId)).FirstOrDefault();
        ValidateMenuReferences(menu, categories);
        if (req.Name?.Trim().Length > MenuFields.MaxNameLength)
            throw new ValidationException("Menu name is too long.") { Code = ErrorCodes.OnboardingMenuInvalid };
        var details = new SaveMenuRequest { Name = string.IsNullOrWhiteSpace(req.Name) ? DefaultMenuName : req.Name.Trim() };
        menu = menu is null
            ? await _menus.CreateMenuAsync(restaurantId, details)
            : await _menus.UpdateMenuAsync(restaurantId, menu.Id, new SaveMenuRequest { Name = details.Name, Description = menu.Description, Currency = menu.Currency });

        HashSet<int> keptCategories = [.. categories.Where(c => c.Id.HasValue).Select(c => c.Id!.Value)];
        List<MenuCategoryDto> existing = (await _menus.GetMenuAsync(restaurantId, menu.Id)).Categories;
        foreach (MenuCategoryDto gone in existing.Where(c => !keptCategories.Contains(c.Id)))
        {
            await _menus.DeleteCategoryAsync(restaurantId, gone.Id);
        }

        var categoryOrder = new List<int>();
        foreach (OnboardingMenuCategoryDto category in categories)
        {
            MenuCategoryDto saved = await UpsertCategoryAsync(restaurantId, menu.Id, existing, category);
            categoryOrder.Add(saved.Id);
            await SaveItemsAsync(restaurantId, saved, category);
        }

        if (categoryOrder.Count > 1)
        {
            await _menus.ReorderCategoriesAsync(restaurantId, menu.Id, categoryOrder);
        }

        MarkStep(restaurant, OnboardingStep.Menu, OnboardingStepState.Done);
        await _repo.SaveChangesAsync();

        Describe(restaurant, "Saved the first menu");
        return await BuildStateAsync(restaurant);
    }

    public async Task<MenuPublicTokensDto> GetMenuTokensAsync(int restaurantId)
    {
        await RequireRestaurantAsync(restaurantId, forWrite: false);
        return await _menus.GetPublicTokensAsync(restaurantId);
    }

    public async Task<MenuItemDto> SetMenuAvailabilityAsync(int restaurantId, int itemId, string? availability)
    {
        await RequireRestaurantAsync(restaurantId);
        MenuItemDto item = await RequireMenuItemAsync(restaurantId, itemId);
        if (availability is null || !MenuFields.TryParseAvailability(availability, out _))
            throw new ValidationException("Unknown dish availability.") { Code = ErrorCodes.MenuAvailabilityInvalid };
        return await _menus.UpdateItemAsync(restaurantId, itemId, new SaveMenuItemRequest
        {
            Name = item.Name,
            Description = item.Description,
            PriceMinor = item.PriceMinor,
            Allergens = item.Allergens,
            DietaryTags = item.DietaryTags,
            Availability = availability,
        });
    }

    public async Task<MenuItemDto> SetMenuPhotoAsync(int restaurantId, int itemId, Stream content, string contentType)
    {
        await RequireRestaurantAsync(restaurantId);
        await RequireMenuItemAsync(restaurantId, itemId);
        if (content.Length > 2 * 1024 * 1024)
            throw new ValidationException("Dish photo must be under 2 MB.") { Code = ErrorCodes.MenuItemImageTooLarge };
        if (!await ImageSignature.MatchesAsync(content, contentType))
            throw new ValidationException("Only JPEG, PNG, and WebP images are accepted.") { Code = ErrorCodes.MediaUnsupportedImageType };
        return await _menus.UploadItemPhotoAsync(restaurantId, itemId, content, contentType);
    }

    public async Task<MenuItemDto> DeleteMenuPhotoAsync(int restaurantId, int itemId)
    {
        await RequireRestaurantAsync(restaurantId);
        await RequireMenuItemAsync(restaurantId, itemId);
        await _menus.DeleteItemPhotoAsync(restaurantId, itemId);
        return await RequireMenuItemAsync(restaurantId, itemId);
    }

    private async Task<MenuItemDto> RequireMenuItemAsync(int restaurantId, int itemId)
        => (await _menus.GetMenusAsync(restaurantId)).SelectMany(m => m.Categories).SelectMany(c => c.Items)
            .FirstOrDefault(i => i.Id == itemId)
            ?? throw new NotFoundException("Menu not found.") { Code = ErrorCodes.MenuNotFound };

    // ── Step 5: logo and colours ─────────────────────────────────────────────

    public async Task<OnboardingStateDto> SaveBrandingAsync(int restaurantId, SaveOnboardingBrandingRequest req)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId);
        SiteDto site = await _sites.GetAsync(restaurantId);

        await _sites.UpdateAsync(restaurantId, SiteRequestFrom(site, theme: req.Theme, tagline: req.Tagline, color: req.PrimaryColor ?? string.Empty));

        MarkStep(restaurant, OnboardingStep.Branding, OnboardingStepState.Done);
        await _repo.SaveChangesAsync();

        Describe(restaurant, "Saved the logo and colours");
        return await BuildStateAsync(restaurant);
    }

    public async Task<OnboardingStateDto> SetLogoAsync(int restaurantId, Stream file, string contentType)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId);
        await _sites.SetImageAsync(restaurantId, SiteImageKind.Logo, file, contentType);
        return await BuildStateAsync(restaurant);
    }

    public async Task<OnboardingStateDto> DeleteLogoAsync(int restaurantId)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId);
        await _sites.DeleteImageAsync(restaurantId, SiteImageKind.Logo);
        return await BuildStateAsync(restaurant);
    }

    // ── Skipping, publishing ─────────────────────────────────────────────────

    /// <seealso>OnboardingServiceTests.SkipStep_SkipsAnOptionalStep_AndRefusesARequiredOne</seealso>
    public async Task<OnboardingStateDto> SkipStepAsync(int restaurantId, string key)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId);
        if (!OnboardingProgress.TryParseKey(key, out OnboardingStep step))
        {
            throw new ValidationException("Unknown step.") { Code = ErrorCodes.OnboardingStepUnknown };
        }

        if (!OnboardingProgress.CanSkip(step))
        {
            throw new BusinessRuleException("That step cannot be skipped.") { Code = ErrorCodes.OnboardingStepRequired };
        }

        if (OnboardingProgress.StateOf(restaurant.OnboardingSteps, step) == OnboardingStepState.Todo)
        {
            MarkStep(restaurant, step, OnboardingStepState.Skipped);
            await _repo.SaveChangesAsync();
        }

        return await BuildStateAsync(restaurant);
    }

    /// <summary>
    /// Takes the restaurant live: the booking page, the QR menu and the website at once. The
    /// website and the menu are switched on first, so a refusal from either leaves the restaurant a draft.
    /// </summary>
    /// <seealso>OnboardingServiceTests.Publish_GoesLive_WhenTheRequiredStepsAreDone</seealso>
    /// <seealso>OnboardingServiceTests.Publish_IsRefusedUntilTheRequiredStepsAreDone_AndNothingGoesLive</seealso>
    /// <seealso>OnboardingServiceTests.Publish_IsRefusedOnASuspendedRestaurant</seealso>
    public async Task<OnboardingStateDto> PublishAsync(int restaurantId)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId);
        List<string> blockers = Blockers(restaurant);
        if (blockers.Count > 0)
        {
            throw new BusinessRuleException("Finish the required steps before publishing.")
            {
                Code = ErrorCodes.OnboardingNotPublishable,
                Args = new Dictionary<string, object> { ["steps"] = string.Join(", ", blockers) },
            };
        }

        await _sites.SetPublishedAsync(restaurantId, true);
        foreach (MenuDto menu in (await _menus.GetMenusAsync(restaurantId)).Where(m => !m.IsPublished && m.Categories.Count > 0))
        {
            await _menus.SetPublishedAsync(restaurantId, menu.Id, true);
        }

        _audit.RecordChange("status", restaurant.Status, RestaurantStatus.Published);
        restaurant.Status = RestaurantStatus.Published;
        restaurant.PublishedAt ??= _clock.UtcNow;
        await _repo.SaveChangesAsync();

        _audit.Describe(AuditActions.OnboardingPublish, AuditTargets.Restaurant, AuditTargets.IdOf(restaurant.Id),
            restaurant.Name, restaurant.Id, $"Published \"{restaurant.Name}\"");
        return await BuildStateAsync(restaurant);
    }

    /// <summary>Back to a draft. <c>PublishedAt</c> is cleared so a later reactivation by the platform does not bring it back live.</summary>
    public async Task<OnboardingStateDto> UnpublishAsync(int restaurantId)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId);
        _audit.RecordChange("status", restaurant.Status, RestaurantStatus.Draft);
        restaurant.Status = RestaurantStatus.Draft;
        restaurant.PublishedAt = null;
        await _repo.SaveChangesAsync();

        _audit.Describe(AuditActions.OnboardingUnpublish, AuditTargets.Restaurant, AuditTargets.IdOf(restaurant.Id),
            restaurant.Name, restaurant.Id, $"Took \"{restaurant.Name}\" offline");
        return await BuildStateAsync(restaurant);
    }

    // ── State ────────────────────────────────────────────────────────────────

    private async Task<OnboardingStateDto> BuildStateAsync(Restaurant restaurant)
    {
        string? steps = restaurant.OnboardingSteps;
        SiteDto site = await _sites.GetAsync(restaurant.Id);
        List<Section> sections = await _repo.GetSectionsWithTablesAsync(restaurant.Id);
        MenuDto? menu = (await _menus.GetMenusAsync(restaurant.Id)).FirstOrDefault();
        List<string> blockers = Blockers(restaurant);
        bool live = restaurant.Status == RestaurantStatus.Published;
        OnboardingStep? next = OnboardingProgress.Next(steps);

        return new OnboardingStateDto
        {
            Id = restaurant.Id,
            Name = restaurant.Name,
            Status = restaurant.Status.ToString(),
            SuspensionReason = restaurant.Status == RestaurantStatus.Suspended ? restaurant.SuspensionReason : null,
            Steps = [.. OnboardingProgress.All.Select(s => new OnboardingStepDto
            {
                Key = OnboardingProgress.KeyOf(s),
                State = OnboardingProgress.StateOf(steps, s).ToString(),
                CanSkip = OnboardingProgress.CanSkip(s),
            })],
            NextStep = next is null ? null : OnboardingProgress.KeyOf(next.Value),
            CanPublish = restaurant.Status != RestaurantStatus.Suspended && blockers.Count == 0,
            PublishBlockers = blockers,
            Info = new OnboardingInfoDto
            {
                Name = restaurant.Name,
                Address = restaurant.Address,
                PhoneNumber = restaurant.PhoneNumber,
                EmailAddress = restaurant.EmailAddress,
                LegalName = site.Legal.Name,
                CompanyNumber = site.Legal.CompanyNumber,
                VatNumber = restaurant.VatNumber,
                BookingRetentionMonths = restaurant.BookingRetentionMonths ?? BookingRetention.DefaultMonths,
            },
            Hours = new OnboardingHoursDto
            {
                OpenHours = OpenWeek(restaurant),
                DefaultBookingDurationMinutes = restaurant.DefaultBookingDurationMinutes,
            },
            Layout = new OnboardingLayoutDto
            {
                Sections = [.. sections.OrderBy(s => s.SortOrder).ThenBy(s => s.Id).Select(s => new OnboardingSectionDto
                {
                    Id = s.Id,
                    Name = s.Name,
                    Tables = [.. s.Tables.OrderBy(t => t.Id).Select(t => new OnboardingTableDto { Id = t.Id, Name = t.Name, Seats = t.Seats })],
                })],
            },
            Menu = ToMenuDto(menu),
            Branding = new OnboardingBrandingDto
            {
                Theme = site.Theme,
                PrimaryColor = site.PrimaryColor,
                Tagline = site.Tagline,
                LogoUrl = site.LogoUrl,
            },
            Links = new OnboardingLinksDto
            {
                SitePath = live && site.IsPublished ? site.PublicPath : null,
                BookingPath = live ? $"/locations/{restaurant.Id}" : null,
                MenuPath = live ? $"/menu/r/{restaurant.PublicToken}" : null,
                MenuToken = restaurant.PublicToken,
            },
            Capabilities = new OnboardingCapabilitiesDto { MenuImport = true },
        };
    }

    private static List<string> Blockers(Restaurant restaurant)
        => [.. OnboardingProgress.Required
            .Where(s => OnboardingProgress.StateOf(restaurant.OnboardingSteps, s) != OnboardingStepState.Done)
            .Select(OnboardingProgress.KeyOf)];

    private static OnboardingMenuDto ToMenuDto(MenuDto? menu) => new()
    {
        Currency = menu?.Currency ?? "EUR",
        MenuId = menu?.Id,
        Name = menu?.Name ?? DefaultMenuName,
        Categories = [.. (menu?.Categories ?? []).Select(c => new OnboardingMenuCategoryDto
        {
            Id = c.Id,
            Name = c.Name,
            IsVisible = c.IsVisible,
            Items = [.. c.Items.Select(i => new OnboardingMenuItemDto
            {
                Id = i.Id,
                Name = i.Name,
                Description = i.Description,
                PrimaryLanguage = i.PrimaryLanguage,
                Translations = i.Translations,
                PriceMinor = i.PriceMinor,
                ImageUrl = i.ImageUrl,
                Availability = i.Availability,
                Allergens = i.Allergens,
                DietaryTags = i.DietaryTags,
            })],
        })],
    };

    private static List<DayHoursDto> OpenWeek(Restaurant restaurant)
    {
        HashSet<int> openDays = [.. restaurant.OpenDays
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(d => int.TryParse(d, NumberStyles.None, CultureInfo.InvariantCulture, out int day) ? day : 0)];
        return [.. OpeningHoursHelper.ResolveWeek(restaurant).Where(d => openDays.Contains(d.Day))];
    }

    /// <summary>Evening sittings first, since that is what a guest is looking for; the first open day's grid.</summary>
    private static List<string> SampleSlots(Restaurant restaurant, List<DayHoursDto> open)
    {
        DayHoursDto? day = open.FirstOrDefault();
        if (day is null
            || !OpeningHours.TryParseTime(day.Open, out int openH, out int openM)
            || !OpeningHours.TryParseTime(day.Close, out int closeH, out int closeM))
        {
            return [];
        }

        int start = (openH * 60) + openM;
        int end = (closeH * 60) + closeM;
        if (end <= start)
        {
            end += 24 * 60;
        }

        var slots = new List<int>();
        for (int t = start; t + restaurant.DefaultBookingDurationMinutes <= end; t += restaurant.BookingSlotIntervalMinutes)
        {
            slots.Add(t);
        }

        const int Evening = 18 * 60;
        IEnumerable<int> pick = slots.Any(t => t >= Evening) ? slots.Where(t => t >= Evening) : slots;
        return [.. pick.Take(PreviewSlotCount).Select(t => string.Create(CultureInfo.InvariantCulture, $"{(t / 60) % 24:D2}:{t % 60:D2}"))];
    }

    // ── Layout and menu helpers ──────────────────────────────────────────────

    private static void ValidateLayout(List<OnboardingSectionDto> sections)
    {
        if (sections.Count == 0 || sections.All(s => s.Tables.Count == 0))
        {
            throw new ValidationException("Add at least one table.") { Code = ErrorCodes.OnboardingLayoutEmpty };
        }

        foreach (OnboardingSectionDto section in sections)
        {
            if (string.IsNullOrWhiteSpace(section.Name) || section.Name.Trim().Length > OnboardingFields.MaxSectionNameLength
                || section.Tables.Any(t => t.Seats is < 1 or > OnboardingFields.MaxSeats
                    || (t.Name is not null && t.Name.Trim().Length > OnboardingFields.MaxTableNameLength)))
            {
                throw new ValidationException("A room needs a name, and a table between 1 and 50 seats.") { Code = ErrorCodes.OnboardingLayoutInvalid };
            }
        }
    }

    private static void RejectUnknownIds(List<Section> current, HashSet<int> keptSections, HashSet<int> keptTables)
    {
        HashSet<int> knownSections = [.. current.Select(s => s.Id)];
        HashSet<int> knownTables = [.. current.SelectMany(s => s.Tables).Select(t => t.Id)];
        if (keptSections.Any(id => !knownSections.Contains(id)) || keptTables.Any(id => !knownTables.Contains(id)))
        {
            // An id from another restaurant is no more known here than an invented one.
            throw new ValidationException("The layout refers to a room or table that does not exist.") { Code = ErrorCodes.OnboardingLayoutInvalid };
        }
    }

    private static Task RejectIfInUseAsync(DeleteImpactDto? impact)
        => impact is { Bookings: > 0 }
            ? throw new BusinessRuleException("A table with an upcoming booking cannot be removed.")
            {
                Code = ErrorCodes.OnboardingLayoutInUse,
                Args = new Dictionary<string, object> { ["bookings"] = impact.Bookings },
            }
            : Task.CompletedTask;

    private async Task<int> UpsertSectionAsync(int restaurantId, List<Section> current, OnboardingSectionDto wanted)
    {
        string name = wanted.Name.Trim();
        if (wanted.Id is { } id)
        {
            if (current.First(s => s.Id == id).Name != name)
            {
                await _restaurants.UpdateSectionAsync(restaurantId, id, name);
            }

            return id;
        }

        SectionDto created = await _restaurants.AddSectionAsync(restaurantId, name)
            ?? throw RestaurantNotFound();
        return created.Id;
    }

    private async Task UpsertTableAsync(int restaurantId, int sectionId, OnboardingTableDto table)
    {
        string? name = string.IsNullOrWhiteSpace(table.Name) ? null : table.Name.Trim();
        if (table.Id is { } id)
        {
            await _restaurants.UpdateTableAsync(restaurantId, sectionId, id, name, table.Seats);
            return;
        }

        _ = await _restaurants.AddTableAsync(restaurantId, sectionId, name, table.Seats);
    }

    private static void ValidateMenu(List<OnboardingMenuCategoryDto> categories)
    {
        foreach (var item in categories.SelectMany(c => c.Items))
        {
            if (item.PrimaryLanguage is not null) MenuTranslations.RequireLanguage(item.PrimaryLanguage);
            _ = MenuTranslations.Validate(item.Translations);
        }
        if (categories.Any(c => InvalidMenuName(c.Name) || c.Items.Any(InvalidMenuItem)))
        {
            throw new ValidationException("Every category and dish needs a valid name, description and price.") { Code = ErrorCodes.OnboardingMenuInvalid };
        }

        if (categories.SelectMany(c => c.Items).Any(i => !MenuFields.TryParseFlags(i.Allergens, out Allergens _) || !MenuFields.TryParseFlags(i.DietaryTags, out DietaryTags _)))
        {
            throw new ValidationException("A dish's allergens must be names from the 14 EU allergens and its diets Vegetarian, Vegan or GlutenFree.") { Code = ErrorCodes.OnboardingMenuInvalid };
        }
    }

    private static bool InvalidMenuName(string? name)
        => string.IsNullOrWhiteSpace(name) || name.Trim().Length > MenuFields.MaxNameLength;

    private static bool InvalidMenuItem(OnboardingMenuItemDto item)
        => InvalidMenuName(item.Name)
            || item.Description?.Trim().Length > MenuFields.MaxDescriptionLength
            || item.PriceMinor is < 0 or > MenuFields.MaxPriceMinor;

    private static void ValidateMenuReferences(MenuDto? menu, List<OnboardingMenuCategoryDto> categories)
    {
        var seenCategories = new HashSet<int>();
        var seenItems = new HashSet<int>();
        foreach (OnboardingMenuCategoryDto category in categories)
        {
            MenuCategoryDto? known = category.Id is { } id ? menu?.Categories.FirstOrDefault(c => c.Id == id) : null;
            if (category.Id.HasValue && (known is null || !seenCategories.Add(category.Id.Value)))
                throw new ValidationException("Unknown or repeated category.") { Code = ErrorCodes.OnboardingMenuInvalid };
            foreach (OnboardingMenuItemDto item in category.Items.Where(i => i.Id.HasValue))
            {
                if (known is null || !known.Items.Any(i => i.Id == item.Id) || !seenItems.Add(item.Id!.Value))
                    throw new ValidationException("Unknown or repeated dish.") { Code = ErrorCodes.OnboardingMenuInvalid };
            }
        }
    }

    private async Task<MenuCategoryDto> UpsertCategoryAsync(int restaurantId, int menuId, List<MenuCategoryDto> existing, OnboardingMenuCategoryDto wanted)
    {
        var request = new SaveMenuCategoryRequest { Name = wanted.Name.Trim(), IsVisible = true };
        if (wanted.Id is { } id)
        {
            MenuCategoryDto known = existing.FirstOrDefault(c => c.Id == id)
                ?? throw new ValidationException("The menu refers to a category that does not exist.") { Code = ErrorCodes.OnboardingMenuInvalid };
            request.Description = known.Description;
            request.IsVisible = known.IsVisible;
            return await _menus.UpdateCategoryAsync(restaurantId, id, request);
        }

        return await _menus.CreateCategoryAsync(restaurantId, menuId, request);
    }

    private async Task SaveItemsAsync(int restaurantId, MenuCategoryDto saved, OnboardingMenuCategoryDto wanted)
    {
        List<MenuItemDto> existing = (await _menus.GetMenusAsync(restaurantId))
            .SelectMany(m => m.Categories).FirstOrDefault(c => c.Id == saved.Id)?.Items ?? [];
        HashSet<int> kept = [.. wanted.Items.Where(i => i.Id.HasValue).Select(i => i.Id!.Value)];
        foreach (MenuItemDto gone in existing.Where(i => !kept.Contains(i.Id)))
        {
            await _menus.DeleteItemAsync(restaurantId, gone.Id);
        }

        var order = new List<int>();
        foreach (OnboardingMenuItemDto item in wanted.Items)
        {
            var request = new SaveMenuItemRequest
            {
                Name = item.Name.Trim(),
                PrimaryLanguage = item.PrimaryLanguage,
                Translations = item.Translations,
                Description = string.IsNullOrWhiteSpace(item.Description) ? null : item.Description.Trim(),
                PriceMinor = item.PriceMinor,
                Allergens = item.Allergens,
                DietaryTags = item.DietaryTags,
            };
            if (item.Id is { } id)
            {
                MenuItemDto known = existing.FirstOrDefault(i => i.Id == id)
                    ?? throw new ValidationException("The menu refers to a dish that does not exist.") { Code = ErrorCodes.OnboardingMenuInvalid };
                request.Availability = known.Availability;
                request.Allergens ??= known.Allergens;
                request.DietaryTags ??= known.DietaryTags;
                order.Add((await _menus.UpdateItemAsync(restaurantId, id, request)).Id);
            }
            else
            {
                order.Add((await _menus.CreateItemAsync(restaurantId, saved.Id, request)).Id);
            }
        }

        if (order.Count > 1)
        {
            await _menus.ReorderItemsAsync(restaurantId, saved.Id, order);
        }
    }

    public const string DefaultMenuName = "Carte";

    // ── Gate and small helpers ───────────────────────────────────────────────

    /// <summary>
    /// The only way in to a restaurant. Not a member, no such restaurant and an archived one all
    /// answer the same 404; a suspended restaurant can still be read, so the restaurateur sees
    /// why, but takes no write.
    /// </summary>
    private async Task<Restaurant> RequireRestaurantAsync(int restaurantId, bool forWrite = true)
    {
        int userId = RequireUserId();
        Restaurant restaurant = await _repo.FindMemberRestaurantAsync(userId, restaurantId) ?? throw RestaurantNotFound();
        if (restaurant.IsArchived)
        {
            throw RestaurantNotFound();
        }

        if (forWrite && restaurant.Status == RestaurantStatus.Suspended)
        {
            throw new ConflictException("This restaurant is suspended.") { Code = ErrorCodes.OnboardingSuspended };
        }

        return restaurant;
    }

    private int RequireUserId() => _currentUser.UserId ?? throw RestaurantNotFound();

    private async Task<RestaurantInvitation> RequirePendingInvitationAsync(string? token)
    {
        RestaurantInvitation? invitation = string.IsNullOrWhiteSpace(token)
            ? null
            : await _repo.FindInvitationByHashAsync(InvitationToken.Hash(token));
        return invitation is not null && invitation.StateAt(_clock.UtcNow) == InvitationState.Pending && invitation.Restaurant is { IsArchived: false }
            ? invitation
            : throw InvalidInvitation();
    }

    private static NotFoundException InvalidInvitation()
        => new("This invitation is not valid.") { Code = ErrorCodes.PlatformInvitationInvalid };

    private static NotFoundException RestaurantNotFound()
        => new("Restaurant not found.") { Code = ErrorCodes.PlatformNotFound };

    private static void RequireCurrentConsent(List<LegalDocumentRefDto>? accepted)
    {
        accepted ??= [];
        foreach (LegalDocument document in LegalCatalog.AcceptedAtSignUp)
        {
            LegalDocumentRefDto? given = accepted.FirstOrDefault(a => string.Equals(a.Key, document.Key, StringComparison.OrdinalIgnoreCase));
            if (given is null)
            {
                throw new ValidationException("Every legal document must be accepted.") { Code = ErrorCodes.OnboardingConsentRequired };
            }

            if (given.Version != document.Version)
            {
                throw new ValidationException("The documents have changed since they were shown.") { Code = ErrorCodes.OnboardingConsentOutdated };
            }
        }
    }

    private static void RequirePassword(string? password)
    {
        if (string.IsNullOrEmpty(password) || password.Length < MinPasswordLength)
        {
            throw new ValidationException($"Password must be at least {MinPasswordLength} characters.")
            {
                Code = ErrorCodes.UserPasswordTooShort,
                Args = new Dictionary<string, object> { ["min"] = MinPasswordLength },
            };
        }
    }

    private static string Required(string? value, string code)
        => string.IsNullOrWhiteSpace(value) ? throw new ValidationException("A required field is missing.") { Code = code } : value.Trim();

    private static void MarkStep(Restaurant restaurant, OnboardingStep step, OnboardingStepState state)
        => restaurant.OnboardingSteps = OnboardingProgress.Mark(restaurant.OnboardingSteps, step, state);

    private static SaveSiteRequest SiteRequestFrom(
        SiteDto site, string? theme = null, string? tagline = null, string? color = null, SiteLegalDto? legal = null) => new()
        {
            Theme = theme ?? site.Theme,
            Tagline = theme is null ? site.Tagline : tagline,
            PrimaryColor = color,
            SocialLinks = site.SocialLinks,
            Legal = legal ?? site.Legal,
        };

    private void Describe(Restaurant restaurant, string summary)
        => _audit.Describe(AuditActions.OnboardingSave, AuditTargets.Restaurant, AuditTargets.IdOf(restaurant.Id),
            restaurant.Name, restaurant.Id, summary);
}

/// <summary>What accepting an invitation yields: the session token for the cookie, and where to land.</summary>
public sealed record AcceptedInvitation(string Jwt, int RestaurantId);
