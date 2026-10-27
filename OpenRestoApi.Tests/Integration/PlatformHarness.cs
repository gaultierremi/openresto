using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Legal;
using OpenRestoApi.Core.Domain;
using OpenRestoApi.Infrastructure.Persistence;

namespace OpenRestoApi.Tests.Integration;

/// <summary>
/// Drives the platform journey through the real pipeline: an operator invites, a restaurateur
/// accepts and runs the assistant. Shared by the HTTP tests and the service-level ones, which
/// resolve their services from the same host so no internal repository is named.
/// </summary>
internal sealed class PlatformHarness : IDisposable
{
    public const string Password = "a-long-password-1";
    public const string ValidCompanyNumber = "0123.456.749";

    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    private readonly TestWebAppFactory _root;

    public PlatformHarness(TestWebAppFactory root, Action<IWebHostBuilder>? configure = null)
    {
        _root = root;
        Mail = new CapturingEmail();
        App = root.WithWebHostBuilder(builder =>
        {
            configure?.Invoke(builder);
            builder.ConfigureServices(services =>
            {
                foreach (ServiceDescriptor d in services.Where(d => d.ServiceType == typeof(IEmailService)).ToList())
                {
                    services.Remove(d);
                }

                services.AddSingleton(Mail);
                services.AddScoped<IEmailService>(sp => sp.GetRequiredService<CapturingEmail>());
                services.AddSingleton<IMediaStore, InMemoryMediaStore>();
            });
        });
    }

    public WebApplicationFactory<Program> App { get; }
    public CapturingEmail Mail { get; }

    public void Dispose() => App.Dispose();

    public sealed record SentMail(string To, string Subject, string Html);

    public sealed class CapturingEmail : IEmailService
    {
        private readonly System.Collections.Concurrent.ConcurrentQueue<SentMail> _sent = new();

        public bool Fail { get; set; }
        public IReadOnlyList<SentMail> Sent => [.. _sent];

        public Task<bool> TestConnectionAsync() => Task.FromResult(true);

        public Task SendEmailAsync(string recipient, string subject, string htmlBody)
        {
            if (Fail)
            {
                throw new InvalidOperationException("smtp down");
            }

            _sent.Enqueue(new SentMail(recipient, subject, htmlBody));
            return Task.CompletedTask;
        }
    }

    private sealed class InMemoryMediaStore : IMediaStore
    {
        public Task<string> ReplaceAsync(string slot, string extension, Stream content)
        {
            using var copy = new MemoryStream();
            content.CopyTo(copy);
            return Task.FromResult($"{slot}.{extension}");
        }

        public void TryDelete(string fileName) { }
    }

    // ── People ───────────────────────────────────────────────────────────────

    public HttpClient Operator() => Client(_root.GenerateTestJwt());

    public HttpClient Client(string? bearer = null)
    {
        HttpClient client = App.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        if (bearer is not null)
        {
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", bearer);
        }

        return client;
    }

    public async Task<HttpClient> ManagerAsync()
    {
        AdminCredential manager = await InDbAsync(async db =>
        {
            const string email = "platform-manager@test.com";
            AdminCredential? existing = await db.AdminCredentials.FirstOrDefaultAsync(c => c.Email == email);
            if (existing is not null) return existing;
            var created = new AdminCredential { Email = email, PasswordHash = "x", PasswordSalt = "x", Role = UserRoles.Manager };
            db.AdminCredentials.Add(created);
            await db.SaveChangesAsync();
            return created;
        });
        return Client(TestWebAppFactory.GenerateJwt(manager.Id, manager.Email, manager.Role, manager.SessionVersion));
    }

    // ── Journey ──────────────────────────────────────────────────────────────

    public sealed record Invited(int RestaurantId, string Token, string Email, PlatformInvitationResultDto Result);

    public async Task<Invited> InviteAsync(string? name = null, string? email = null, string? locale = null)
    {
        string unique = Guid.NewGuid().ToString("N")[..8];
        email ??= $"owner-{unique}@resto.example";
        HttpResponseMessage response = await Operator().PostAsJsonAsync("/api/platform/restaurants", new
        {
            name = name ?? $"Chez {unique}",
            ownerEmail = email,
            locale,
        });
        response.EnsureSuccessStatusCode();
        PlatformInvitationResultDto result = (await response.Content.ReadFromJsonAsync<PlatformInvitationResultDto>(Json))!;
        return new Invited(result.Restaurant.Id, TokenOf(result.InvitationUrl), email, result);
    }

    public static string TokenOf(string invitationUrl) => invitationUrl[(invitationUrl.LastIndexOf('/') + 1)..];

    public static object Acceptance(string? password = null, IEnumerable<LegalDocumentRefDto>? documents = null) => new
    {
        password = password ?? Password,
        displayName = "Gérante",
        acceptedDocuments = (documents ?? CurrentDocuments()).Select(d => new { key = d.Key, version = d.Version }).ToList(),
    };

    public static List<LegalDocumentRefDto> CurrentDocuments()
        => [.. LegalCatalog.AcceptedAtSignUp.Select(d => new LegalDocumentRefDto { Key = d.Key, Version = d.Version })];

    /// <summary>Accepts the invitation and returns a client carrying the restaurateur's own token.</summary>
    public async Task<HttpClient> AcceptAsync(Invited invited)
    {
        HttpResponseMessage response = await Client().PostAsJsonAsync($"/api/onboarding/invitations/{invited.Token}/accept", Acceptance());
        response.EnsureSuccessStatusCode();
        return await RestaurateurAsync(invited.Email);
    }

    public async Task<HttpClient> RestaurateurAsync(string email)
    {
        AdminCredential account = await InDbAsync(db => db.AdminCredentials.FirstAsync(c => c.Email == email));
        return Client(TestWebAppFactory.GenerateJwt(account.Id, account.Email, account.Role, account.SessionVersion));
    }

    public async Task<(int RestaurantId, HttpClient Restaurateur)> RunningRestaurantAsync(string? name = null)
    {
        Invited invited = await InviteAsync(name);
        return (invited.RestaurantId, await AcceptAsync(invited));
    }

    // ── Wizard payloads ──────────────────────────────────────────────────────

    public static object Info(Action<Dictionary<string, object?>>? change = null)
    {
        var body = new Dictionary<string, object?>
        {
            ["name"] = "Brasserie de la Senne",
            ["address"] = "Rue des Fabriques 25, 1000 Bruxelles",
            ["phoneNumber"] = "+32 2 123 45 67",
            ["emailAddress"] = "contact@senne.example",
            ["legalName"] = "Senne Dorée SRL",
            ["companyNumber"] = ValidCompanyNumber,
            ["vatNumber"] = "BE0123456749",
        };
        change?.Invoke(body);
        return body;
    }

    public static object Hours() => new
    {
        openHours = new[]
        {
            new { day = 2, open = "12:00", close = "22:00" },
            new { day = 3, open = "12:00", close = "22:00" },
            new { day = 6, open = "18:00", close = "23:30" },
        },
        defaultBookingDurationMinutes = 90,
    };

    public static object Layout() => new
    {
        sections = new[]
        {
            new { id = (int?)null, name = "Salle", tables = new[] { new { id = (int?)null, name = "T1", seats = 2 }, new { id = (int?)null, name = "T2", seats = 6 } } },
            new { id = (int?)null, name = "Terrasse", tables = new[] { new { id = (int?)null, name = "T3", seats = 4 } } },
        },
    };

    public static object Menu() => new
    {
        name = "Carte",
        categories = new[]
        {
            new { id = (int?)null, name = "Entrées", items = new[] { new { id = (int?)null, name = "Croquettes aux crevettes", description = "Deux pièces", priceMinor = (long?)1450 } } },
            new { id = (int?)null, name = "Plats", items = new[] { new { id = (int?)null, name = "Carbonade flamande", description = (string?)null, priceMinor = (long?)2200 } } },
        },
    };

    public static object Branding() => new { theme = "Gastronomique", primaryColor = "#7a1f2b", tagline = "Cuisine belge de saison" };

    public async Task<OnboardingStateDto> CompleteRequiredStepsAsync(HttpClient restaurateur, int restaurantId)
    {
        string root = $"/api/onboarding/restaurants/{restaurantId}";
        (await restaurateur.PutAsJsonAsync($"{root}/info", Info())).EnsureSuccessStatusCode();
        (await restaurateur.PutAsJsonAsync($"{root}/hours", Hours())).EnsureSuccessStatusCode();
        HttpResponseMessage layout = await restaurateur.PutAsJsonAsync($"{root}/layout", Layout());
        layout.EnsureSuccessStatusCode();
        return (await layout.Content.ReadFromJsonAsync<OnboardingStateDto>(Json))!;
    }

    // ── Database ─────────────────────────────────────────────────────────────

    public async Task<T> InDbAsync<T>(Func<AppDbContext, Task<T>> query)
    {
        using IServiceScope scope = App.Services.CreateScope();
        return await query(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    public async Task InDbAsync(Func<AppDbContext, Task> action)
        => await InDbAsync(async db => { await action(db); return 0; });

    public static async Task<JsonElement> ErrorOf(HttpResponseMessage response)
        => await response.Content.ReadFromJsonAsync<JsonElement>(Json);

    public static string Code(JsonElement error) => error.GetProperty("code").GetString()!;
}
