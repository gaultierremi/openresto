using Microsoft.Extensions.Logging;
using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Services;
using OpenRestoApi.Core.Application.Site;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Launch;

public enum RegistrationOutcome { Sent, Unavailable }

public class PublicRegistrationService(
    IPlatformRepository repository,
    IAdminCredentialRepository credentials,
    BrandService brand,
    ISystemClock clock,
    IEmailService emailService,
    ILogger<PublicRegistrationService> logger)
{
    private static readonly SemaphoreSlim _requests = new(1, 1);
    public static readonly TimeSpan MinimumEmailInterval = TimeSpan.FromMinutes(10);
    public const int DailyEmailLimit = 5;

    public async Task<RegistrationOutcome> RequestAsync(string? name, string? email, string? website)
    {
        if (!string.IsNullOrEmpty(website)) return RegistrationOutcome.Sent;

        string restaurantName = name?.Trim() ?? "";
        if (restaurantName.Length is < 1 or > 100 || restaurantName.Any(char.IsControl))
            throw new ValidationException("Vérifiez le nom du restaurant.");
        string address = UserFields.NormalizeEmail(email);
        BrandSettings settings = await brand.GetAsync();
        string baseUrl = brand.GetWebsiteUrl(settings).TrimEnd('/');
        if (!SiteFormat.IsSecureUrl(baseUrl) || baseUrl == BrandService.DefaultWebsiteUrl)
            return RegistrationOutcome.Unavailable;

        await _requests.WaitAsync();
        try
        {
            if (await credentials.GetByEmailAsync(address) is not null) return RegistrationOutcome.Sent;

            DateTime now = clock.UtcNow;
            // Count persisted attempts, including revoked links and SMTP failures: restarting
            // the process or changing IP must not reset the recipient's protection.
            if (await repository.CountPublicRegistrationRequestsAsync(address, now - MinimumEmailInterval) > 0
                || await repository.CountPublicRegistrationRequestsAsync(address, now.AddDays(-1)) >= DailyEmailLimit)
                return RegistrationOutcome.Sent;

            RestaurantInvitation? previous = await repository.FindPublicRegistrationAsync(address);
            string token = InvitationToken.New();
            Restaurant restaurant = previous?.Restaurant ?? new Restaurant
            {
                Name = restaurantName,
                Timezone = PlatformService.NewRestaurantTimezone,
                Status = RestaurantStatus.Draft,
                BookingRetentionMonths = BookingRetention.DefaultMonths,
            };
            if (previous is not null) previous.RevokedAt = now;
            var invitation = new RestaurantInvitation
            {
                Restaurant = restaurant,
                Email = address,
                TokenHash = InvitationToken.Hash(token),
                Locale = "fr",
                CreatedAt = now,
                ExpiresAt = now + PlatformService.InvitationLifetime,
            };
            repository.AddInvitation(invitation);
            await repository.SaveChangesAsync();

            (string subject, string html) = InvitationMail.Build("fr", restaurant.Name,
                settings.AppName ?? "OpenResto", settings.PrimaryColor ?? "#215d49", baseUrl,
                $"{baseUrl}/onboarding/invitation/{token}?lang=fr", invitation.ExpiresAt);
            try
            {
                await emailService.SendEmailAsync(address, subject, html);
                return RegistrationOutcome.Sent;
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning("Registration email failed ({FailureType})", ex.GetType().Name);
                return RegistrationOutcome.Unavailable;
            }
        }
        finally
        {
            _requests.Release();
        }
    }
}
