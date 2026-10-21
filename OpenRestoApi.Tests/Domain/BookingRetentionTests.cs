using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Domain;

public class BookingRetentionTests
{
    private static readonly DateTime Now = new(2026, 10, 20, 12, 0, 0, DateTimeKind.Utc);
    private const int Months = 12;

    private static readonly DateTime Cutoff = Now.AddMonths(-Months);

    private static Booking Sitting(DateTime date, DateTime? endTime, DateTime? anonymizedAt = null)
        => new()
        {
            Id = 1,
            RestaurantId = 1,
            Seats = 2,
            BookingRef = "REF-1",
            Date = date,
            EndTime = endTime,
            AnonymizedAt = anonymizedAt,
        };

    // ── IsExpired ────────────────────────────────────────────────────────────

    [Fact]
    public void IsExpired_False_JustInsideTheRetention()
    {
        Assert.False(BookingRetention.IsExpired(Sitting(Cutoff.AddHours(-2), Cutoff.AddTicks(1)), Months, Now));
        Assert.False(BookingRetention.IsExpired(Sitting(Cutoff.AddHours(-2), Cutoff), Months, Now));
    }

    [Fact]
    public void IsExpired_True_JustOutsideTheRetention()
    {
        Assert.True(BookingRetention.IsExpired(Sitting(Cutoff.AddHours(-3), Cutoff.AddTicks(-1)), Months, Now));
        Assert.True(BookingRetention.IsExpired(Sitting(Cutoff.AddHours(-3), Cutoff.AddDays(-1)), Months, Now));
    }

    [Fact]
    public void IsExpired_FallsBackToTheStart_WhenTheBookingHasNoEnd()
    {
        Assert.False(BookingRetention.IsExpired(Sitting(Cutoff, endTime: null), Months, Now));
        Assert.True(BookingRetention.IsExpired(Sitting(Cutoff.AddTicks(-1), endTime: null), Months, Now));
    }

    [Fact]
    public void IsExpired_MeasuresFromTheEnd_NotTheStart()
    {
        // The sitting began before the cutoff but ended after it: still inside the retention.
        Assert.False(BookingRetention.IsExpired(Sitting(Cutoff.AddHours(-1), Cutoff.AddHours(1)), Months, Now));
    }

    [Fact]
    public void IsExpired_False_ForABookingInTheFuture()
        => Assert.False(BookingRetention.IsExpired(Sitting(Now.AddYears(1), Now.AddYears(1).AddHours(2)), Months, Now));

    [Fact]
    public void IsExpired_False_ForABookingAlreadyAnonymised()
    {
        DateTime longAgo = Cutoff.AddYears(-3);

        Assert.True(BookingRetention.IsExpired(Sitting(longAgo, longAgo.AddHours(2)), Months, Now));
        Assert.False(BookingRetention.IsExpired(Sitting(longAgo, longAgo.AddHours(2), anonymizedAt: Now.AddDays(-1)), Months, Now));
    }

    [Fact]
    public void IsExpired_FollowsTheRestaurantsOwnNumberOfMonths()
    {
        Booking sixMonthsOld = Sitting(Now.AddMonths(-6).AddHours(-2), Now.AddMonths(-6));

        Assert.False(BookingRetention.IsExpired(sixMonthsOld, months: 12, Now));
        Assert.True(BookingRetention.IsExpired(sixMonthsOld, months: 5, Now));
    }

    // ── IsValid ──────────────────────────────────────────────────────────────

    [Theory]
    [InlineData(1)]
    [InlineData(12)]
    [InlineData(60)]
    public void IsValid_AcceptsFromOneToSixtyMonths(int months)
        => Assert.True(BookingRetention.IsValid(months));

    [Theory]
    [InlineData(int.MinValue)]
    [InlineData(-1)]
    [InlineData(0)]
    [InlineData(61)]
    [InlineData(int.MaxValue)]
    public void IsValid_RefusesZeroAndSixtyOne_AndBeyond(int months)
        => Assert.False(BookingRetention.IsValid(months));

    [Fact]
    public void TheDefault_IsWithinTheBounds()
        => Assert.True(BookingRetention.IsValid(BookingRetention.DefaultMonths));

    // ── CutoffUtc ────────────────────────────────────────────────────────────

    [Fact]
    public void CutoffUtc_GoesBackWholeMonths()
        => Assert.Equal(new DateTime(2025, 10, 20, 12, 0, 0, DateTimeKind.Utc), BookingRetention.CutoffUtc(Now, 12));

    [Fact]
    public void CutoffUtc_ClampsToTheEndOfAShorterMonth()
    {
        DateTime endOfMarch = new(2027, 3, 31, 8, 30, 0, DateTimeKind.Utc);

        Assert.Equal(new DateTime(2027, 2, 28, 8, 30, 0, DateTimeKind.Utc), BookingRetention.CutoffUtc(endOfMarch, 1));
        Assert.Equal(new DateTime(2026, 9, 30, 8, 30, 0, DateTimeKind.Utc), BookingRetention.CutoffUtc(endOfMarch, 6));
    }

    [Fact]
    public void CutoffUtc_CrossesAYearBoundary()
        => Assert.Equal(new DateTime(2025, 12, 15, 0, 0, 0, DateTimeKind.Utc),
            BookingRetention.CutoffUtc(new DateTime(2026, 2, 15, 0, 0, 0, DateTimeKind.Utc), 2));
}
