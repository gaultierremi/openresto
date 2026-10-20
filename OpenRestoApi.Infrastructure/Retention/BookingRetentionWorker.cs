using CustomAccessibility.Attributes;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Services;

namespace OpenRestoApi.Infrastructure.Retention;

/// <summary>
/// Runs the guest-data retention pass once a day, in the shape of <c>AuditRetentionWorker</c>: a
/// scope per pass, a delayed first run, and a failed pass that only costs one tick. The log line
/// carries counts and nothing else — the point of the pass is that these rows stop naming people.
/// <seealso>BookingRetentionWorkerTests.RunsRepeatedly_AndSurvivesAFailedPass</seealso>
/// </summary>
[OnlyAccessibleBy("OpenRestoApi.Extensions.ServiceCollectionExtensions")]
[OnlyAccessibleBy("OpenRestoApi.Tests.Infrastructure.BookingRetentionWorkerTests")]
[ExternalAccessAllowed]
internal sealed class BookingRetentionWorker(
    IServiceScopeFactory scopeFactory,
    ILogger<BookingRetentionWorker> logger,
    TimeSpan? startupDelay = null,
    TimeSpan? interval = null) : BackgroundService
{
    private static readonly TimeSpan DefaultStartupDelay = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan DefaultInterval = TimeSpan.FromDays(1);

    private readonly TimeSpan _startupDelay = startupDelay ?? DefaultStartupDelay;
    private readonly TimeSpan _interval = interval ?? DefaultInterval;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await Task.Delay(_startupDelay, stoppingToken);

            using var timer = new PeriodicTimer(_interval);
            do
            {
                await RunPassAsync();
            }
            while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException)
        {
            // Shutdown, not a failure.
        }
    }

    private async Task RunPassAsync()
    {
        try
        {
            await using AsyncServiceScope scope = scopeFactory.CreateAsyncScope();
            RetentionOutcome outcome = await scope.ServiceProvider.GetRequiredService<BookingRetentionService>().RunAsync();
            if (outcome.Total > 0)
            {
                logger.LogInformation(
                    "[BookingRetention] Anonymised {Bookings} bookings, {Tickets} waitlist tickets; removed {Devices} reminder devices and {Failures} failed-mail records.",
                    outcome.Bookings, outcome.WaitlistEntries, outcome.PushSubscriptions, outcome.EmailFailures);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "[BookingRetention] Pass failed.");
        }
    }
}
