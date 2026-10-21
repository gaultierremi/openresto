using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Services;
using OpenRestoApi.Core.Domain;
using OpenRestoApi.Infrastructure.Retention;

namespace OpenRestoApi.Tests.Infrastructure;

/// <summary>
/// The scheduling around <see cref="BookingRetentionService"/>: it runs repeatedly rather than
/// once, a failed pass costs one tick and not the worker, and cancellation is a shutdown. The
/// arithmetic is <c>BookingRetentionServiceTests</c>'.
/// </summary>
public class BookingRetentionWorkerTests
{
    private sealed class FixedClock : ISystemClock
    {
        public DateTime UtcNow => new(2027, 3, 1, 12, 0, 0, DateTimeKind.Utc);
    }

    private static BookingRetentionWorker CreateWorker(Mock<IPlatformRepository> repository, TimeSpan startupDelay)
    {
        var service = new BookingRetentionService(repository.Object, new FixedClock());
        var provider = new Mock<IServiceProvider>();
        provider.Setup(p => p.GetService(typeof(BookingRetentionService))).Returns(service);
        var scope = new Mock<IServiceScope>();
        scope.Setup(s => s.ServiceProvider).Returns(provider.Object);
        var factory = new Mock<IServiceScopeFactory>();
        factory.Setup(f => f.CreateScope()).Returns(scope.Object);

        return new BookingRetentionWorker(factory.Object, NullLogger<BookingRetentionWorker>.Instance, startupDelay, TimeSpan.FromMilliseconds(20));
    }

    private static async Task RunUntilAsync(BookingRetentionWorker worker, Func<bool> done)
    {
        await worker.StartAsync(CancellationToken.None);
        try
        {
            for (int attempt = 0; attempt < 150 && !done(); attempt++)
            {
                await Task.Delay(20);
            }
        }
        finally
        {
            await worker.StopAsync(CancellationToken.None);
        }
    }

    [Fact]
    public async Task RunsRepeatedly_AndSurvivesAFailedPass()
    {
        var repository = new Mock<IPlatformRepository>();
        int passes = 0;
        repository.Setup(r => r.GetAllRestaurantsAsync()).Returns(() =>
        {
            int pass = Interlocked.Increment(ref passes);
            return pass == 1
                ? throw new InvalidOperationException("database is locked")
                : Task.FromResult(new List<Restaurant> { new() { Id = 1, Name = "R", BookingRetentionMonths = 12 } });
        });
        repository.Setup(r => r.AnonymizeBeforeAsync(It.IsAny<int>(), It.IsAny<DateTime>(), It.IsAny<DateTime>()))
            .ReturnsAsync(new RetentionOutcome(1, 0, 0, 0, 0));

        await RunUntilAsync(CreateWorker(repository, TimeSpan.Zero), () => Volatile.Read(ref passes) >= 3);

        Assert.True(Volatile.Read(ref passes) >= 3, $"Expected the worker to keep going after the first failure, saw {passes} passes.");
        repository.Verify(r => r.AnonymizeBeforeAsync(1, It.IsAny<DateTime>(), It.IsAny<DateTime>()), Times.AtLeastOnce);
    }

    [Fact]
    public async Task WaitsBeforeItsFirstPass_AndStopsCleanlyDuringTheWait()
    {
        var repository = new Mock<IPlatformRepository>();
        repository.Setup(r => r.GetAllRestaurantsAsync()).ReturnsAsync([]);
        BookingRetentionWorker worker = CreateWorker(repository, TimeSpan.FromMinutes(5));

        await worker.StartAsync(CancellationToken.None);
        await Task.Delay(60);
        await worker.StopAsync(CancellationToken.None);

        repository.Verify(r => r.GetAllRestaurantsAsync(), Times.Never);
    }
}
