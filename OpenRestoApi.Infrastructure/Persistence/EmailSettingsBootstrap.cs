using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Infrastructure.Persistence;

/// <summary>
/// Fills the SMTP settings from <c>EmailSettings:*</c> configuration (<c>EmailSettings__Host</c>
/// and friends in the environment) on a database that has none yet.
/// </summary>
/// <seealso>EmailSettingsBootstrapTests.LeavesAnExistingRowAlone_SoTheAdminsEditsSurviveARestart</seealso>
/// <seealso>InitializeDatabaseTests.FreshInstall_SeedsEmailSettings_FromConfiguration_AndKeepsThemOnTheNextStart</seealso>
public static class EmailSettingsBootstrap
{
    private const string _section = "EmailSettings";
    private const int _defaultPort = 587;

    /// <summary>Creates the settings row when none exists and a host is configured; true when it did.</summary>
    /// <seealso>EmailSettingsBootstrapTests.StoresThePassword_OnlyThroughTheCredentialProtector</seealso>
    /// <seealso>EmailSettingsBootstrapTests.RejectsAValueItCannotRead_RatherThanGuessing</seealso>
    public static bool SeedFromConfiguration(AppDbContext db, IConfiguration configuration, IServiceProvider services)
    {
        string? host = configuration[$"{_section}:Host"]?.Trim();
        if (string.IsNullOrEmpty(host) || db.EmailSettings.Any())
        {
            return false;
        }

        string? password = configuration[$"{_section}:Password"];
        string? fromName = configuration[$"{_section}:FromName"];
        string? fromEmail = configuration[$"{_section}:FromEmail"];

        db.EmailSettings.Add(new EmailSettings
        {
            Host = host,
            Port = ReadInt(configuration, "Port", _defaultPort),
            Username = configuration[$"{_section}:Username"]?.Trim() ?? string.Empty,
            EncryptedPassword = string.IsNullOrEmpty(password)
                ? string.Empty
                : services.GetRequiredService<ICredentialProtector>().Encrypt(password),
            EnableSsl = ReadBool(configuration, "EnableSsl", true),
            FromName = string.IsNullOrWhiteSpace(fromName) ? null : fromName.Trim(),
            FromEmail = string.IsNullOrWhiteSpace(fromEmail) ? null : fromEmail.Trim(),
            SendBookingConfirmations = ReadBool(configuration, "SendBookingConfirmations", true),
        });
        db.SaveChanges();
        return true;
    }

    private static int ReadInt(IConfiguration configuration, string key, int fallback)
    {
        string? raw = configuration[$"{_section}:{key}"];
        if (string.IsNullOrWhiteSpace(raw))
        {
            return fallback;
        }

        return int.TryParse(raw, out int value) && value is > 0 and <= 65535
            ? value
            : throw new InvalidOperationException($"{_section}:{key} must be a TCP port (1-65535), got '{raw}'.");
    }

    private static bool ReadBool(IConfiguration configuration, string key, bool fallback)
    {
        string? raw = configuration[$"{_section}:{key}"];
        if (string.IsNullOrWhiteSpace(raw))
        {
            return fallback;
        }

        return bool.TryParse(raw, out bool value)
            ? value
            : throw new InvalidOperationException($"{_section}:{key} must be true or false, got '{raw}'.");
    }
}
