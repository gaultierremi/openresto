using OpenRestoApi.Core.Application.Exceptions;

namespace OpenRestoApi.Core.Application.Utilities;

/// <summary>Bounds and normalisation for what the setup assistant collects.</summary>
public static class OnboardingFields
{
    public const int MaxSectionNameLength = 60;
    public const int MaxTableNameLength = 40;
    public const int MaxSeats = 50;

    private const int MinPhoneDigits = 8;
    private const int MaxPhoneDigits = 15;

    /// <summary>
    /// A phone a guest can ring: kept as the restaurateur typed it, but it must hold between 8 and
    /// 15 digits. Belgian numbers are written a dozen ways (<c>02 123 45 67</c>, <c>+32 2 123 45 67</c>),
    /// so the shape is left alone and only the digit count is checked.
    /// </summary>
    /// <seealso>OnboardingFieldsTests.NormalizePhone_AcceptsTheWaysABelgianNumberIsWritten</seealso>
    /// <seealso>OnboardingFieldsTests.NormalizePhone_RefusesTooFewOrTooManyDigits</seealso>
    public static string NormalizePhone(string? phone)
    {
        string? normalized = ContactFields.NormalizePhone(phone ?? string.Empty);
        int digits = normalized?.Count(char.IsAsciiDigit) ?? 0;
        return digits is >= MinPhoneDigits and <= MaxPhoneDigits
            ? normalized!
            : throw new ValidationException("A phone number is required.") { Code = ErrorCodes.OnboardingPhoneRequired };
    }
}
