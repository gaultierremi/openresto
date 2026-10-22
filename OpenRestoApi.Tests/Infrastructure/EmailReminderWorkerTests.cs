using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Services;
using OpenRestoApi.Core.Domain;
using OpenRestoApi.Infrastructure.Notifications;

namespace OpenRestoApi.Tests.Infrastructure;

public sealed class EmailReminderWorkerTests
{
    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task RunsAutomatically_AndContinuesAfterAFailedPass(bool failFirst)
    {
        var repo = new Mock<IRestaurantOperationsRepository>();
        var clock = new Mock<ISystemClock>();
        clock.SetupGet(c => c.UtcNow).Returns(DateTime.UtcNow);
        var observed = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        int passes = 0;
        repo.Setup(r => r.DueEmailRemindersAsync(It.IsAny<DateTime>())).Returns(() =>
        {
            int count = Interlocked.Increment(ref passes);
            if (count >= 2) observed.TrySetResult();
            if (count == 1 && failFirst) throw new InvalidOperationException("fixture failure");
            return Task.FromResult(new List<Booking>());
        });
        var services = new ServiceCollection();
        services.AddSingleton(repo.Object);
        services.AddSingleton(clock.Object);
        services.AddSingleton(Mock.Of<IEmailService>());
        services.AddScoped<EmailReminderService>();
        await using ServiceProvider provider = services.BuildServiceProvider();
        using var worker = new EmailReminderWorker(provider.GetRequiredService<IServiceScopeFactory>(),
            NullLogger<EmailReminderWorker>.Instance, TimeSpan.FromMilliseconds(10));
        await worker.StartAsync(CancellationToken.None);
        await observed.Task.WaitAsync(TimeSpan.FromSeconds(5));
        await worker.StopAsync(CancellationToken.None);
        Assert.True(passes >= 2);
    }
}
