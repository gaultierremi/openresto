using Moq;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Services;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Services;

/// <summary>
/// What the pass asks of the repository, restaurant by restaurant. Where the rows actually go is
/// <c>PlatformRepositoryTests</c>'; this pins the arithmetic and the guard around it.
/// </summary>
public class BookingRetentionServiceTests
{
    private static readonly DateTime Now = new(2027, 3, 31, 12, 0, 0, DateTimeKind.Utc);

    private sealed class FixedClock : ISystemClock
    {
        public DateTime UtcNow => Now;
    }

    private static Restaurant Restaurant(int id, int? months) => new() { Id = id, Name = $"R{id}", BookingRetentionMonths = months };

    [Fact]
    public async Task Run_AnonymisesOnlyWhatIsPastEachRestaurantsOwnPeriod()
    {
        var repository = new Mock<IPlatformRepository>();
        repository.Setup(r => r.GetAllRestaurantsAsync()).ReturnsAsync([Restaurant(1, 12), Restaurant(2, 24), Restaurant(3, 1)]);
        var cutoffs = new Dictionary<int, DateTime>();
        repository.Setup(r => r.AnonymizeBeforeAsync(It.IsAny<int>(), It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .Callback<int, DateTime, DateTime>((id, cutoff, now) =>
            {
                cutoffs[id] = cutoff;
                Assert.Equal(Now, now);
            })
            .ReturnsAsync((int id, DateTime _, DateTime _) => new RetentionOutcome(id, id * 10, id * 100, id * 1000, id * 10000));

        RetentionOutcome total = await new BookingRetentionService(repository.Object, new FixedClock()).RunAsync();

        Assert.Equal(new DateTime(2026, 3, 31, 12, 0, 0, DateTimeKind.Utc), cutoffs[1]);
        Assert.Equal(new DateTime(2025, 3, 31, 12, 0, 0, DateTimeKind.Utc), cutoffs[2]);
        Assert.Equal(new DateTime(2027, 2, 28, 12, 0, 0, DateTimeKind.Utc), cutoffs[3]);
        Assert.Equal(new RetentionOutcome(6, 60, 600, 6000, 60000), total);
    }

    [Fact]
    public async Task Run_SkipsARestaurantWithNoPeriod_EvenWhenItHoldsFiveYearOldBookings()
    {
        var repository = new Mock<IPlatformRepository>();
        repository.Setup(r => r.GetAllRestaurantsAsync()).ReturnsAsync([Restaurant(1, null), Restaurant(2, 12)]);
        repository.Setup(r => r.AnonymizeBeforeAsync(It.IsAny<int>(), It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new RetentionOutcome(1, 0, 0, 0, 0));

        RetentionOutcome total = await new BookingRetentionService(repository.Object, new FixedClock()).RunAsync();

        repository.Verify(r => r.AnonymizeBeforeAsync(1, It.IsAny<DateTime>(), It.IsAny<DateTime>()), Times.Never);
        repository.Verify(r => r.AnonymizeBeforeAsync(2, BookingRetention.CutoffUtc(Now, 12), Now), Times.Once);
        Assert.Equal(1, total.Bookings);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    [InlineData(61)]
    public async Task Run_SkipsARestaurantWhoseStoredPeriodIsOutOfBounds(int months)
    {
        var repository = new Mock<IPlatformRepository>();
        repository.Setup(r => r.GetAllRestaurantsAsync()).ReturnsAsync([Restaurant(1, months), Restaurant(2, 12)]);
        repository.Setup(r => r.AnonymizeBeforeAsync(It.IsAny<int>(), It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new RetentionOutcome(1, 0, 0, 0, 0));

        RetentionOutcome total = await new BookingRetentionService(repository.Object, new FixedClock()).RunAsync();

        repository.Verify(r => r.AnonymizeBeforeAsync(1, It.IsAny<DateTime>(), It.IsAny<DateTime>()), Times.Never);
        repository.Verify(r => r.AnonymizeBeforeAsync(2, It.IsAny<DateTime>(), It.IsAny<DateTime>()), Times.Once);
        Assert.Equal(1, total.Bookings);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(60)]
    public async Task Run_RunsTheEdgesOfTheValidRange(int months)
    {
        var repository = new Mock<IPlatformRepository>();
        repository.Setup(r => r.GetAllRestaurantsAsync()).ReturnsAsync([Restaurant(1, months)]);
        repository.Setup(r => r.AnonymizeBeforeAsync(1, It.IsAny<DateTime>(), It.IsAny<DateTime>())).ReturnsAsync(new RetentionOutcome(0, 0, 0, 0, 0));

        await new BookingRetentionService(repository.Object, new FixedClock()).RunAsync();

        repository.Verify(r => r.AnonymizeBeforeAsync(1, BookingRetention.CutoffUtc(Now, months), Now), Times.Once);
    }

    [Fact]
    public async Task Run_WithNoRestaurants_DoesNothing()
    {
        var repository = new Mock<IPlatformRepository>();
        repository.Setup(r => r.GetAllRestaurantsAsync()).ReturnsAsync([]);

        RetentionOutcome total = await new BookingRetentionService(repository.Object, new FixedClock()).RunAsync();

        Assert.Equal(0, total.Total);
        repository.Verify(r => r.AnonymizeBeforeAsync(It.IsAny<int>(), It.IsAny<DateTime>(), It.IsAny<DateTime>()), Times.Never);
    }
}
