using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Services;

/// <summary>
/// The platform's own space: which restaurants exist and where each stands, inviting the person
/// who will run one, suspending and reactivating. Who may call it is decided by the
/// <see cref="AuthPolicies.RequirePlatform"/> policy; nothing here looks at a role.
/// <para>
/// What it never does is read a restaurant's guests as a side effect. The list is counts and
/// dates; the one path that returns a guest's name or address is
/// <see cref="AccessGuestDataAsync"/>, and it will not run without a stated reason, which the
/// audit trail keeps.
/// </para>
/// </summary>
/// <seealso>PlatformServiceTests.List_CarriesCountsAndDates_AndNoGuestField</seealso>
/// <seealso>PlatformServiceTests.AccessGuestData_RefusesAMissingOrShortReason_AndReadsNothing</seealso>
public class PlatformService(
    IPlatformRepository repository,
    IAdminCredentialRepository credentials,
    BrandService brandService,
    ISystemClock clock,
    ICurrentUserService? currentUser = null,
    IEmailService? emailService = null,
    IAuditScope? audit = null)
{
    /// <summary>A week and a half is long enough for a restaurateur who is busy on a service night.</summary>
    public static readonly TimeSpan InvitationLifetime = TimeSpan.FromDays(14);

    public const string NewRestaurantTimezone = "Europe/Brussels";

    /// <summary>The most recent bookings a guest-data access returns; a support question never needs the whole book.</summary>
    public const int GuestDataLimit = 200;

    private readonly IPlatformRepository _repo = repository;
    private readonly IAdminCredentialRepository _credentials = credentials;
    private readonly BrandService _brand = brandService;
    private readonly ISystemClock _clock = clock;
    private readonly ICurrentUserService _currentUser = currentUser ?? NullCurrentUserService.Instance;
    private readonly IEmailService? _email = emailService;
    private readonly IAuditScope _audit = audit ?? NullAuditScope.Instance;

    public async Task<List<PlatformRestaurantDto>> GetRestaurantsAsync()
    {
        DateTime now = _clock.UtcNow;
        return [.. (await _repo.GetRestaurantRowsAsync(now)).Select(r => ToDto(r, now))];
    }

    public async Task<PlatformInvitationResultDto> CreateRestaurantAsync(CreatePlatformRestaurantRequest req)
    {
        string name = req.Name?.Trim() ?? string.Empty;
        if (name.Length == 0)
        {
            throw new ValidationException("A restaurant name is required.") { Code = ErrorCodes.PlatformRestaurantNameRequired };
        }

        string email = NormalizeInvitee(req.OwnerEmail);
        await RejectTakenAddressAsync(email);

        Restaurant restaurant = await _repo.AddRestaurantAsync(new Restaurant
        {
            Name = name,
            Timezone = NewRestaurantTimezone,
            Status = RestaurantStatus.Draft,
        });

        PlatformInvitationResultDto result = await IssueInvitationAsync(restaurant, email, req.Locale);
        Describe(AuditActions.PlatformRestaurantCreate, restaurant, $"Created the restaurant \"{restaurant.Name}\" and invited its owner");
        return result;
    }

    /// <summary>
    /// Sends a fresh link, replacing any still-open one. Also the way back in for a restaurateur
    /// who lost their password: accepting an invitation to a restaurant the account already runs
    /// sets a new password instead of creating a second account.
    /// </summary>
    public async Task<PlatformInvitationResultDto> SendInvitationAsync(int restaurantId, SendInvitationRequest req)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId);
        List<RestaurantInvitation> sent = await _repo.GetInvitationsAsync(restaurantId);
        List<RestaurantInvitation> open = [.. sent.Where(i => i.AcceptedAt is null && i.RevokedAt is null)];

        string? previous = sent.OrderByDescending(i => i.CreatedAt).ThenByDescending(i => i.Id).FirstOrDefault()?.Email;
        string email = NormalizeInvitee(string.IsNullOrWhiteSpace(req.Email) ? previous : req.Email);

        // A first invitation to an address that already has an account would only fail later, at
        // acceptance; a recovery invitation is the one case where the account is expected.
        if (!await IsMemberAddressAsync(restaurantId, email))
        {
            await RejectTakenAddressAsync(email);
        }

        DateTime now = _clock.UtcNow;
        foreach (RestaurantInvitation stale in open)
        {
            stale.RevokedAt = now;
        }

        PlatformInvitationResultDto result = await IssueInvitationAsync(restaurant, email, req.Locale);
        Describe(AuditActions.PlatformInvitationSend, restaurant, $"Sent an invitation for \"{restaurant.Name}\"");
        return result;
    }

    public async Task<PlatformRestaurantDto> SuspendAsync(int restaurantId, SuspendRestaurantRequest req)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId);
        if (restaurant.Status == RestaurantStatus.Suspended)
        {
            throw new BusinessRuleException("The restaurant is already suspended.") { Code = ErrorCodes.PlatformAlreadySuspended };
        }

        string? reason = string.IsNullOrWhiteSpace(req.Reason) ? null : req.Reason.Trim();
        if (reason is { Length: > PlatformFields.MaxSuspensionReasonLength })
        {
            throw new ValidationException("The reason is too long.")
            {
                Code = ErrorCodes.PlatformSuspendReasonTooLong,
                Args = new Dictionary<string, object> { ["max"] = PlatformFields.MaxSuspensionReasonLength },
            };
        }

        _audit.RecordChange("status", restaurant.Status, RestaurantStatus.Suspended);
        restaurant.Status = RestaurantStatus.Suspended;
        restaurant.SuspendedAt = _clock.UtcNow;
        restaurant.SuspensionReason = reason;
        await _repo.SaveChangesAsync();

        Describe(AuditActions.PlatformSuspend, restaurant, $"Suspended \"{restaurant.Name}\"");
        return await RowFor(restaurantId);
    }

    /// <summary>A restaurant that had been published comes back published; one still being set up comes back as a draft.</summary>
    public async Task<PlatformRestaurantDto> ReactivateAsync(int restaurantId)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId);
        if (restaurant.Status != RestaurantStatus.Suspended)
        {
            throw new BusinessRuleException("The restaurant is not suspended.") { Code = ErrorCodes.PlatformNotSuspended };
        }

        RestaurantStatus restored = restaurant.PublishedAt is null ? RestaurantStatus.Draft : RestaurantStatus.Published;
        _audit.RecordChange("status", restaurant.Status, restored);
        restaurant.Status = restored;
        restaurant.SuspendedAt = null;
        restaurant.SuspensionReason = null;
        await _repo.SaveChangesAsync();

        Describe(AuditActions.PlatformReactivate, restaurant, $"Reactivated \"{restaurant.Name}\"");
        return await RowFor(restaurantId);
    }

    /// <summary>
    /// The one door to a restaurant's guests. It refuses without a reason of a few words, reads
    /// nothing in that case, and records the reason on the audit entry of the request that opened
    /// it. The reason is for the operator to write about the ticket, never about a guest.
    /// </summary>
    /// <seealso>PlatformServiceTests.AccessGuestData_ReturnsTheGuests_AndRecordsTheReason</seealso>
    public async Task<GuestDataAccessDto> AccessGuestDataAsync(int restaurantId, GuestDataAccessRequest req)
    {
        string reason = req.Reason?.Trim() ?? string.Empty;
        if (reason.Length < PlatformFields.MinAccessReasonLength || reason.Length > PlatformFields.MaxAccessReasonLength)
        {
            throw new ValidationException("State why the guests' data is needed.")
            {
                Code = ErrorCodes.PlatformAccessReasonRequired,
                Args = new Dictionary<string, object>
                {
                    ["min"] = PlatformFields.MinAccessReasonLength,
                    ["max"] = PlatformFields.MaxAccessReasonLength,
                },
            };
        }

        Restaurant restaurant = await RequireRestaurantAsync(restaurantId);
        List<Booking> bookings = await _repo.GetRecentBookingsAsync(restaurantId, GuestDataLimit);

        Describe(AuditActions.PlatformGuestDataAccess, restaurant,
            $"Read the guest bookings of \"{restaurant.Name}\" ({bookings.Count}). Reason: {reason}");

        return new GuestDataAccessDto
        {
            RestaurantId = restaurant.Id,
            RestaurantName = restaurant.Name,
            GrantedAt = _clock.UtcNow,
            Bookings = [.. bookings.Select(b => new PlatformGuestBookingDto
            {
                BookingRef = b.BookingRef,
                Date = b.Date,
                Seats = b.Seats,
                CustomerName = b.CustomerName,
                CustomerEmail = b.CustomerEmail,
                SpecialRequests = b.SpecialRequests,
                IsCancelled = b.IsCancelled,
                IsAnonymized = b.AnonymizedAt is not null,
            })],
        };
    }

    public async Task<List<LegalAcceptanceDto>> GetAcceptancesAsync(int restaurantId)
    {
        _ = await RequireRestaurantAsync(restaurantId);
        return [.. (await _repo.GetAcceptancesAsync(restaurantId)).Select(a => new LegalAcceptanceDto
        {
            DocumentKey = a.DocumentKey,
            Version = a.Version,
            Email = a.Email,
            ContentSha256 = a.ContentSha256,
            AcceptedAt = a.AcceptedAt,
        })];
    }

    // ── Invitations ──────────────────────────────────────────────────────────

    private async Task<PlatformInvitationResultDto> IssueInvitationAsync(Restaurant restaurant, string email, string? locale)
    {
        DateTime now = _clock.UtcNow;
        string token = InvitationToken.New();
        var invitation = new RestaurantInvitation
        {
            RestaurantId = restaurant.Id,
            Email = email,
            TokenHash = InvitationToken.Hash(token),
            Locale = InvitationMail.Resolve(locale),
            CreatedByUserId = _currentUser.UserId,
            CreatedAt = now,
            ExpiresAt = now + InvitationLifetime,
        };
        _repo.AddInvitation(invitation);
        await _repo.SaveChangesAsync();

        BrandSettings brand = await _brand.GetAsync();
        string websiteUrl = _brand.GetWebsiteUrl(brand).TrimEnd('/');
        string url = $"{websiteUrl}/onboarding/invitation/{token}";

        bool sent = await TrySendAsync(brand, websiteUrl, restaurant.Name, invitation, url);
        return new PlatformInvitationResultDto { Restaurant = await RowFor(restaurant.Id), InvitationUrl = url, EmailSent = sent };
    }

    private async Task<bool> TrySendAsync(
        BrandSettings brand, string websiteUrl, string restaurantName, RestaurantInvitation invitation, string url)
    {
        if (_email is null)
        {
            return false;
        }

        try
        {
            (string subject, string html) = InvitationMail.Build(
                invitation.Locale,
                restaurantName,
                brand.AppName ?? "Open Resto",
                brand.PrimaryColor ?? "#0a7ea4",
                websiteUrl,
                url,
                invitation.ExpiresAt);
            await _email.SendEmailAsync(invitation.Email, subject, html);
            return true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // The link is still returned to the operator, who can pass it on by hand. The address
            // and the link stay out of the log: the first is personal, the second is the credential.
            Console.WriteLine($"[PlatformService] Invitation mail for restaurant {invitation.RestaurantId} failed: {ex.GetType().Name}");
            return false;
        }
    }

    private static string NormalizeInvitee(string? email)
    {
        try
        {
            return UserFields.NormalizeEmail(email);
        }
        catch (ValidationException)
        {
            throw new ValidationException("A valid email address is required.") { Code = ErrorCodes.PlatformInvitationEmailInvalid };
        }
    }

    private async Task RejectTakenAddressAsync(string email)
    {
        if (await _credentials.GetByEmailAsync(email) is not null)
        {
            throw new BusinessRuleException("An account with that email address already exists.")
            { Code = ErrorCodes.UserEmailAlreadyExists };
        }
    }

    private async Task<bool> IsMemberAddressAsync(int restaurantId, string email)
    {
        AdminCredential? account = await _credentials.GetByEmailAsync(email);
        return account is not null && await _repo.FindMemberRestaurantAsync(account.Id, restaurantId) is not null;
    }

    // ── Reading ──────────────────────────────────────────────────────────────

    private async Task<Restaurant> RequireRestaurantAsync(int restaurantId)
        => await _repo.FindRestaurantAsync(restaurantId)
            ?? throw new NotFoundException("Restaurant not found.") { Code = ErrorCodes.PlatformNotFound };

    private async Task<PlatformRestaurantDto> RowFor(int restaurantId)
    {
        DateTime now = _clock.UtcNow;
        PlatformRestaurantRow row = (await _repo.GetRestaurantRowsAsync(now)).First(r => r.Id == restaurantId);
        return ToDto(row, now);
    }

    private static PlatformRestaurantDto ToDto(PlatformRestaurantRow r, DateTime now)
    {
        int done = OnboardingProgress.All.Count(s => OnboardingProgress.StateOf(r.OnboardingSteps, s) != OnboardingStepState.Todo);
        OnboardingStep? next = OnboardingProgress.Next(r.OnboardingSteps);
        return new PlatformRestaurantDto
        {
            Id = r.Id,
            Name = r.Name,
            Status = r.Status.ToString(),
            PublishedAt = r.PublishedAt,
            SuspendedAt = r.SuspendedAt,
            SuspensionReason = r.SuspensionReason,
            OwnerEmail = r.OwnerEmail,
            LastLoginAt = r.LastLoginAt,
            TotalBookings = r.TotalBookings,
            UpcomingBookings = r.UpcomingBookings,
            StepsDone = done,
            StepsTotal = OnboardingProgress.All.Count,
            NextStep = next is null ? null : OnboardingProgress.KeyOf(next.Value),
            Invitation = r.LatestInvitation is null ? null : new PlatformInvitationDto
            {
                Email = r.LatestInvitation.Email,
                State = r.LatestInvitation.StateAt(now).ToString(),
                CreatedAt = r.LatestInvitation.CreatedAt,
                ExpiresAt = r.LatestInvitation.ExpiresAt,
            },
        };
    }

    private void Describe(string action, Restaurant restaurant, string summary)
        => _audit.Describe(action, AuditTargets.Restaurant, AuditTargets.IdOf(restaurant.Id), restaurant.Name, restaurant.Id, summary);
}
