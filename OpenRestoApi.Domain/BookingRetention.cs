namespace OpenRestoApi.Core.Domain;

/// <summary>
/// How long a restaurant's guests stay identifiable. After <see cref="Restaurant.BookingRetentionMonths"/>
/// a booking keeps its date, party size and table, which is what statistics need, and loses the
/// name, address and notes of the person who made it. A restaurant whose period is null is never
/// erased from.
/// </summary>
/// <seealso>BookingRetentionTests.IsExpired_False_JustInsideTheRetention</seealso>
/// <seealso>BookingRetentionTests.IsExpired_True_JustOutsideTheRetention</seealso>
public static class BookingRetention
{
    public const int DefaultMonths = 12;
    public const int MinMonths = 1;
    public const int MaxMonths = 60;

    public static bool IsValid(int months) => months is >= MinMonths and <= MaxMonths;

    /// <summary>Bookings that ended before this instant are past their retention.</summary>
    public static DateTime CutoffUtc(DateTime nowUtc, int months) => nowUtc.AddMonths(-months);

    /// <summary>
    /// Measured from when the sitting ended (or would have, for a booking with no end), so a
    /// booking made a year ahead is not anonymised before it has happened.
    /// </summary>
    public static bool IsExpired(Booking booking, int months, DateTime nowUtc)
        => booking.AnonymizedAt is null
            && (booking.EndTime ?? booking.Date) < CutoffUtc(nowUtc, months);
}
