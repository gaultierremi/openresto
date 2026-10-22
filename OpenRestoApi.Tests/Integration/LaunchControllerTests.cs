using System.Net;
using System.Net.Http.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Legal;
using OpenRestoApi.Core.Domain;
using OpenRestoApi.Infrastructure.Persistence;

namespace OpenRestoApi.Tests.Integration;

public sealed class LaunchControllerTests(TestWebAppFactory root) : IClassFixture<TestWebAppFactory>, IDisposable
{
    private readonly PlatformHarness.CapturingEmail _mail = new();
    private WebApplicationFactory<Program>? _app;

    private HttpClient Client(bool enabled = true)
    {
        _app = root.WithWebHostBuilder(builder =>
        {
            builder.UseSetting("PublicLaunch:Enabled", enabled.ToString());
            builder.UseSetting("Website:Url", "https://launch.example");
            builder.ConfigureServices(services =>
            {
                foreach (ServiceDescriptor descriptor in services.Where(d => d.ServiceType == typeof(IEmailService)).ToList())
                    services.Remove(descriptor);
                services.AddSingleton<IEmailService>(_mail);
            });
        });
        return _app.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false,
            BaseAddress = new Uri("https://localhost"),
        });
    }

    public void Dispose() => _app?.Dispose();

    private async Task<T> InDb<T>(Func<AppDbContext, Task<T>> action)
    {
        using IServiceScope scope = _app!.Services.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    private static async Task<HttpResponseMessage> Submit(HttpClient client, string name, string email, string? website = null)
    {
        string html = await client.GetStringAsync("/inscription");
        string token = Regex.Match(html, "name=\"__RequestVerificationToken\" value=\"([^\"]+)\"").Groups[1].Value;
        return await client.PostAsync("/inscription", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["Name"] = name,
            ["Email"] = email,
            ["Website"] = website ?? "",
            ["__RequestVerificationToken"] = token,
        }));
    }

    [Fact]
    public async Task LaunchHome_IsFrenchHtmlWithTwoClearEntrances_AndNoRuntimeDependency()
    {
        using HttpClient client = Client();
        HttpResponseMessage response = await client.GetAsync("/");
        string html = await response.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("<html lang=\"fr\">", html);
        Assert.Contains("href=\"/inscription\"", html);
        Assert.Contains("href=\"/locations?lang=fr\"", html);
        Assert.Contains("premier établissement est gratuit", html);
        Assert.Contains("<link rel=\"canonical\" href=\"https://launch.example/\">", html);
        Assert.Contains("name=\"description\"", html);
        Assert.DoesNotContain("<script", html);
        Assert.DoesNotContain("<iframe", html);
        Assert.DoesNotContain("<link rel=\"stylesheet\"", html);
        Assert.Contains("form-action 'self'", response.Headers.GetValues("Content-Security-Policy").Single());
        Assert.Equal("/", (await client.GetAsync("/decouvrir")).Headers.Location!.ToString());
        string sitemap = await client.GetStringAsync("/sitemap.xml");
        Assert.Contains("<loc>https://launch.example/</loc>", sitemap);
        Assert.DoesNotContain("/inscription", sitemap);
    }

    [Fact]
    public async Task DefaultMode_KeepsTheExistingHome_AndRefusesPublicRegistrationWithoutAWrite()
    {
        using HttpClient client = Client(enabled: false);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/decouvrir")).StatusCode);
        Assert.Contains("pas encore ouvertes", await client.GetStringAsync("/inscription"));
        HttpResponseMessage refused = await Submit(client, "Closed", "closed@launch.example");
        Assert.Equal(HttpStatusCode.NotFound, refused.StatusCode);
        Assert.False(await InDb(db => db.RestaurantInvitations.AnyAsync(i => i.Email == "closed@launch.example")));
        Assert.Empty(_mail.Sent);
    }

    [Fact]
    public async Task RequestLink_SendsOnlyByEmail_StoresOnlyAHash_AndKeepsTheRestaurantPrivate()
    {
        using HttpClient client = Client();
        string address = $"signup-{Guid.NewGuid():N}@launch.example";
        HttpResponseMessage response = await Submit(client, "  Le Restaurant Exemple  ", address);
        Assert.Equal(HttpStatusCode.SeeOther, response.StatusCode);
        Assert.Equal("/inscription/envoyee", response.Headers.Location!.ToString());
        Assert.Equal("no-store", response.Headers.CacheControl!.ToString());
        string token = Regex.Match(_mail.Sent.Single().Html, "/onboarding/invitation/([A-Za-z0-9_-]{43})").Groups[1].Value;
        Assert.NotEmpty(token);
        Assert.DoesNotContain(token, await response.Content.ReadAsStringAsync());
        RestaurantInvitation stored = await InDb(db => db.RestaurantInvitations.Include(i => i.Restaurant).SingleAsync(i => i.Email == address));
        Assert.Equal(InvitationToken.Hash(token), stored.TokenHash);
        Assert.Equal(RestaurantStatus.Draft, stored.Restaurant!.Status);
        Assert.Equal("Le Restaurant Exemple", stored.Restaurant.Name);
        Assert.Equal(12, stored.Restaurant.BookingRetentionMonths);
        Assert.False(await InDb(db => db.RestaurantMembers.AnyAsync(m => m.RestaurantId == stored.RestaurantId)));
        Assert.DoesNotContain("Le Restaurant Exemple", await client.GetStringAsync("/api/restaurants"));

        HttpResponseMessage again = await Submit(client, "A different name", address);
        Assert.Equal(HttpStatusCode.SeeOther, again.StatusCode);
        Assert.Equal(1, await InDb(db => db.RestaurantInvitations.Where(i => i.Email == address).Select(i => i.RestaurantId).Distinct().CountAsync()));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/onboarding/invitations/{token}")).StatusCode);
    }

    [Theory]
    [InlineData("", "valid@launch.example")]
    [InlineData("Restaurant", "invalid")]
    [InlineData("Restaurant", "a@b.example\r\nBcc:other@b.example")]
    public async Task InvalidFields_Return400_AndWriteNothing(string name, string email)
    {
        using HttpClient client = Client();
        int before = await InDb(db => db.RestaurantInvitations.CountAsync());
        Assert.Equal(HttpStatusCode.BadRequest, (await Submit(client, name, email)).StatusCode);
        Assert.Equal(before, await InDb(db => db.RestaurantInvitations.CountAsync()));
        Assert.Empty(_mail.Sent);
    }

    [Fact]
    public async Task MissingAntiforgeryToken_Returns400_AndWritesNothing()
    {
        using HttpClient client = Client();
        int before = await InDb(db => db.RestaurantInvitations.CountAsync());
        HttpResponseMessage response = await client.PostAsync("/inscription", new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["Name"] = "Restaurant",
            ["Email"] = "csrf@launch.example",
        }));
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("formulaire a expiré", await response.Content.ReadAsStringAsync());
        Assert.Equal(before, await InDb(db => db.RestaurantInvitations.CountAsync()));
        Assert.Empty(_mail.Sent);
    }

    [Fact]
    public async Task HoneypotAndExistingAddress_AnswerLikeANewRequest_AndCreateNothing()
    {
        using HttpClient client = Client();
        int before = await InDb(db => db.RestaurantInvitations.CountAsync());
        Assert.Equal(HttpStatusCode.SeeOther, (await Submit(client, "Bot", "bot@launch.example", "spam")).StatusCode);
        Assert.Equal(HttpStatusCode.SeeOther, (await Submit(client, "Taken", TestWebAppFactory.AdminEmail)).StatusCode);
        Assert.Equal(before, await InDb(db => db.RestaurantInvitations.CountAsync()));
        Assert.Empty(_mail.Sent);
    }

    [Fact]
    public async Task MailFailure_Returns503_AndARetryUsesTheSamePrivateDraft()
    {
        using HttpClient client = Client();
        string address = $"retry-{Guid.NewGuid():N}@launch.example";
        _mail.Fail = true;
        HttpResponseMessage response = await Submit(client, "Retry", address);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
        string html = await response.Content.ReadAsStringAsync();
        Assert.DoesNotContain("smtp down", html);
        Assert.DoesNotContain(address, html);
        _mail.Fail = false;
        Assert.Equal(HttpStatusCode.SeeOther, (await Submit(client, "Retry", address)).StatusCode);
        Assert.Single(_mail.Sent);
        Assert.Equal(1, await InDb(db => db.RestaurantInvitations.Where(i => i.Email == address).Select(i => i.RestaurantId).Distinct().CountAsync()));
    }

    [Fact]
    public async Task EmailLink_CreatesOnlyARestaurateur_AfterCurrentDocumentsAreAccepted()
    {
        using HttpClient client = Client();
        string address = $"accept-{Guid.NewGuid():N}@launch.example";
        await Submit(client, "Verified", address);
        string token = Regex.Match(_mail.Sent.Single().Html, "/onboarding/invitation/([A-Za-z0-9_-]{43})").Groups[1].Value;
        string path = $"/api/onboarding/invitations/{token}/accept";
        HttpResponseMessage missing = await client.PostAsJsonAsync(path, new { password = PlatformHarness.Password, acceptedDocuments = Array.Empty<object>() });
        Assert.Equal(HttpStatusCode.BadRequest, missing.StatusCode);
        Assert.False(await InDb(db => db.AdminCredentials.AnyAsync(a => a.Email == address)));
        HttpResponseMessage accepted = await client.PostAsJsonAsync(path, new
        {
            password = PlatformHarness.Password,
            acceptedDocuments = LegalCatalog.AcceptedAtSignUp.Select(d => new { d.Key, d.Version }),
        });
        Assert.Equal(HttpStatusCode.OK, accepted.StatusCode);
        Assert.Equal(UserRoles.Restaurateur, await InDb(async db => (await db.AdminCredentials.SingleAsync(a => a.Email == address)).Role));
        Assert.Equal(3, await InDb(db => db.LegalAcceptances.CountAsync(a => a.Email == address)));
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/onboarding/me")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/platform/restaurants")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync("/api/admin/restaurants")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync(path, new { password = PlatformHarness.Password })).StatusCode);
    }

    [Fact]
    public async Task EveryLegalDocument_IsReadableWithoutJavascript_WithItsRealVersionAndReviewWarning()
    {
        using HttpClient client = Client();
        foreach (LegalDocument document in LegalCatalog.All)
        {
            HttpResponseMessage response = await client.GetAsync($"/legal/{document.Key}");
            string html = await response.Content.ReadAsStringAsync();
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Contains(document.Title, html);
            Assert.Contains(document.Version, html);
            Assert.Contains("faire valider par un juriste", html);
            Assert.Contains("noindex,follow", html);
            Assert.DoesNotContain("<script", html);
        }
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/legal/unknown")).StatusCode);
        HttpResponseMessage form = await client.GetAsync("/inscription");
        Assert.Equal("no-store", form.Headers.CacheControl!.ToString());
        Assert.Contains("noindex", form.Headers.GetValues("X-Robots-Tag").Single());
    }

    [Fact]
    public async Task UnfinishedRegistration_IsDeletedAfterThirtyDays_ButNeverAtTheBoundaryOrAfterAcceptance()
    {
        using HttpClient client = Client();
        DateTime cutoff = DateTime.UtcNow.AddDays(-30);
        async Task<int> Add(DateTime created, bool member = false, int? operatorId = null)
            => await InDb(async db =>
            {
                var restaurant = new Restaurant { Name = "Retention example", Status = RestaurantStatus.Draft };
                var invitation = new RestaurantInvitation
                {
                    Restaurant = restaurant,
                    Email = "retention@example.test",
                    TokenHash = InvitationToken.Hash(InvitationToken.New()),
                    CreatedAt = created,
                    ExpiresAt = created.AddDays(14),
                    CreatedByUserId = operatorId,
                };
                db.RestaurantInvitations.Add(invitation);
                await db.SaveChangesAsync();
                if (member)
                {
                    db.RestaurantMembers.Add(new RestaurantMember { RestaurantId = restaurant.Id, UserId = root.GetSeededAdmin().Id, CreatedAt = created });
                    await db.SaveChangesAsync();
                }
                return restaurant.Id;
            });
        int expired = await Add(cutoff.AddSeconds(-1));
        int boundary = await Add(cutoff);
        int recent = await Add(cutoff.AddSeconds(1));
        int accepted = await Add(cutoff.AddDays(-1), member: true);
        int operatorCreated = await Add(cutoff.AddDays(-1), operatorId: root.GetSeededAdmin().Id);
        using IServiceScope scope = _app!.Services.CreateScope();
        await scope.ServiceProvider.GetRequiredService<IPlatformRepository>().DeleteExpiredRegistrationsAsync(cutoff);
        Assert.False(await InDb(db => db.Restaurants.AnyAsync(r => r.Id == expired)));
        Assert.False(await InDb(db => db.RestaurantInvitations.AnyAsync(i => i.RestaurantId == expired)));
        foreach (int kept in new[] { boundary, recent, accepted, operatorCreated })
            Assert.True(await InDb(db => db.Restaurants.AnyAsync(r => r.Id == kept)));
    }

    [Fact]
    public async Task PublicGuestPages_RenderRealAvailability_AndRefuseInvalidDatesOrPartySizes()
    {
        using HttpClient client = Client();
        string date = DateTime.UtcNow.AddDays(14).ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture);
        Assert.Contains("Trouvez votre prochaine table", await client.GetStringAsync("/locations"));
        HttpResponseMessage response = await client.GetAsync($"/locations/1?date={date}&seats=2");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        string html = await response.Content.ReadAsStringAsync();
        Assert.Contains("Pasta Place", html);
        Assert.Contains("<option value=\"", html);
        Assert.Contains("Confirmer la réservation", html);
        Assert.DoesNotContain("_expo", html);
        int before = await InDb(db => db.Bookings.CountAsync());
        foreach (string query in new[] { "date=invalid", "date=2000-01-01", "seats=0", "seats=51" })
            Assert.Equal(HttpStatusCode.BadRequest, (await client.GetAsync($"/locations/1?{query}")).StatusCode);
        Assert.Equal(before, await InDb(db => db.Bookings.CountAsync()));
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/locations/2147483647")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/menu/r/unknown")).StatusCode);
        HttpResponseMessage lookup = await client.GetAsync("/lookup");
        Assert.Equal("no-store", lookup.Headers.CacheControl!.ToString());
        Assert.Contains("noindex", lookup.Headers.GetValues("X-Robots-Tag").Single());
        Assert.Contains("Retrouver ma réservation", await lookup.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task GuestPagesInDefaultMode_ExplicitlySelectTheExistingFrontend()
    {
        using HttpClient client = Client(enabled: false);
        foreach (string path in new[] { "/locations", "/locations/1", "/lookup", "/booking-confirmation/example", "/menu/r/example" })
        {
            HttpResponseMessage response = await client.GetAsync(path);
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Equal("true", response.Headers.GetValues("X-OpenResto-Legacy").Single());
        }
    }
}
