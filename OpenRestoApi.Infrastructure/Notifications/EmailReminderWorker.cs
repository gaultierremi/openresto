using CustomAccessibility.Attributes;
using OpenRestoApi.Core.Application.Services;

namespace OpenRestoApi.Infrastructure.Notifications;

[OnlyAccessibleBy("OpenRestoApi.Extensions.ServiceCollectionExtensions")]
[OnlyAccessibleBy("OpenRestoApi.Tests.Infrastructure.EmailReminderWorkerTests")]
[ExternalAccessAllowed]
internal sealed class EmailReminderWorker(IServiceScopeFactory scopes, ILogger<EmailReminderWorker> logger, TimeSpan? interval = null) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            using var timer = new PeriodicTimer(interval ?? TimeSpan.FromMinutes(1));
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try
                {
                    await using AsyncServiceScope scope = scopes.CreateAsyncScope();
                    await scope.ServiceProvider.GetRequiredService<EmailReminderService>().SendDueAsync();
                }
                catch (Exception)
                {
                    logger.LogWarning("Le passage des rappels mail a échoué ; nouvel essai au prochain passage.");
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
    }
}
