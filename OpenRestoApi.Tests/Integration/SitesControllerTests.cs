using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using ImageMagick;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;
using OpenRestoApi.Infrastructure.Persistence;

namespace OpenRestoApi.Tests.Integration;

/// <summary>
/// The one-page website through the real pipeline: the admin policies and the <c>sites</c> API key
/// scope, the restaurant-nested routes that make another location's photo a 404, and the anonymous
/// pages that must never show an unpublished site, a draft menu or an internal id.
/// </summary>
public sealed partial class SitesControllerTests(TestWebAppFactory factory) : IClassFixture<TestWebAppFactory>, IDisposable
{
    private readonly WebApplicationFactory<Program> _app = factory.WithWebHostBuilder(builder =>
        builder.ConfigureServices(services => services.AddSingleton<IMediaStore, InMemoryMediaStore>()));

    private readonly TestWebAppFactory _factory = factory;

    public void Dispose() => _app.Dispose();

    [GeneratedRegex("Set-Cookie", RegexOptions.IgnoreCase)]
    private static partial Regex SetCookie();

    private sealed class InMemoryMediaStore : IMediaStore
    {
        private readonly System.Collections.Concurrent.ConcurrentDictionary<string, byte> _files = new();

        public IReadOnlyCollection<string> Files => _files.Keys.ToList();

        public Task<string> ReplaceAsync(string slot, string extension, Stream content)
        {
            using var copy = new MemoryStream();
            content.CopyTo(copy);
            string name = $"{slot}.{extension}";
            _files[name] = 0;
            return Task.FromResult(name);
        }

        public void TryDelete(string fileName) => _files.TryRemove(Path.GetFileName(fileName), out _);
    }

    private sealed record Seeded(int RestaurantId, string Name, string Slug, string RestaurantToken);

    private async Task<Seeded> SeedRestaurantAsync(bool archived = false, string? name = null, string? email = "contact@site-test.example", bool walkInOnly = false)
    {
        using IServiceScope scope = _app.Services.CreateScope();
        AppDbContext db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        string unique = Guid.NewGuid().ToString("N")[..10];
        var restaurant = new Restaurant
        {
            Name = name ?? $"Brasserie Test {unique}",
            Address = "Rue des Fabriques 25, 1000 Bruxelles",
            Timezone = "Europe/Brussels",
            EmailAddress = email,
            IsArchived = archived,
            WalkInOnly = walkInOnly,
            OpenDays = "2,3,4,5,6,7",
        };
        var section = new Section { Name = "Salle", Restaurant = restaurant };
        db.AddRange(restaurant, section, new Table { Name = "T1", Seats = 2, Section = section });
        await db.SaveChangesAsync();
        return new Seeded(restaurant.Id, restaurant.Name, SiteSlug.From(restaurant.Name), restaurant.PublicToken);
    }

    private async Task<T> InDbAsync<T>(Func<AppDbContext, Task<T>> query)
    {
        using IServiceScope scope = _app.Services.CreateScope();
        return await query(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    private HttpClient Owner()
    {
        HttpClient client = _app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _factory.GenerateTestJwt());
        return client;
    }

    /// <summary>A guest whose client does not follow redirects, so the redirect itself can be read.</summary>
    private HttpClient GuestWhoStops() => _app.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

    private async Task<HttpClient> ManagerAsync()
    {
        const string email = "sites-manager@test.com";
        AdminCredential manager = await InDbAsync(async db =>
        {
            AdminCredential? existing = await db.AdminCredentials.FirstOrDefaultAsync(c => c.Email == email);
            if (existing != null) return existing;
            var created = new AdminCredential { Email = email, PasswordHash = "x", PasswordSalt = "x", Role = UserRoles.Manager };
            db.AdminCredentials.Add(created);
            await db.SaveChangesAsync();
            return created;
        });
        HttpClient client = _app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            TestWebAppFactory.GenerateJwt(manager.Id, manager.Email, manager.Role, manager.SessionVersion));
        return client;
    }

    private async Task<HttpClient> KeyAsync(string resource, string access)
    {
        HttpResponseMessage minted = await Owner().PostAsJsonAsync("/api/admin/api-keys", new
        {
            name = $"sites-{resource}-{access}-{Guid.NewGuid():N}",
            scopes = new[] { new { resource, access } },
        });
        minted.EnsureSuccessStatusCode();
        string secret = (await minted.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("secret").GetString()!;
        HttpClient client = _app.CreateClient();
        client.DefaultRequestHeaders.Add("X-API-Key", secret);
        return client;
    }

    private static string Site(int restaurantId) => $"/api/admin/restaurants/{restaurantId}/site";

    private static object Body(Action<Dictionary<string, object?>>? change = null)
    {
        var body = new Dictionary<string, object?>
        {
            ["theme"] = "Brasserie",
            ["tagline"] = "Cuisine belge de saison",
            ["socialLinks"] = new[] { new { kind = "Instagram", url = "https://instagram.com/senne" } },
            ["legal"] = new { name = "Senne Dorée SRL", companyNumber = "0123.456.789", vatNumber = "BE 0123.456.789" },
        };
        change?.Invoke(body);
        return body;
    }

    private async Task<Seeded> LiveSiteAsync(Seeded? seeded = null, Action<Dictionary<string, object?>>? change = null)
    {
        Seeded r = seeded ?? await SeedRestaurantAsync();
        HttpClient owner = Owner();
        (await owner.PutAsJsonAsync(Site(r.RestaurantId), Body(change))).EnsureSuccessStatusCode();
        (await owner.PostAsync($"{Site(r.RestaurantId)}/publish", null)).EnsureSuccessStatusCode();
        return r;
    }

    private static string Code(JsonElement error) => error.GetProperty("code").GetString()!;

    private InMemoryMediaStore Store => (InMemoryMediaStore)_app.Services.GetRequiredService<IMediaStore>();

    private static MultipartFormDataContent Picture(string contentType = "image/jpeg", string? alt = "Une photo", uint width = 640, uint height = 480, byte[]? raw = null)
    {
        byte[] bytes = raw ?? RealJpeg(width, height);
        var file = new ByteArrayContent(bytes);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        var content = new MultipartFormDataContent { { file, "file", "photo.jpg" } };
        if (alt is not null)
        {
            content.Add(new StringContent(alt), "alt");
        }
        return content;
    }

    private static byte[] RealJpeg(uint width, uint height)
    {
        using var image = new MagickImage(MagickColors.SteelBlue, width, height) { Format = MagickFormat.Jpeg };
        return image.ToByteArray();
    }

    // ── Who may do what ──────────────────────────────────────────────────────

    [Fact]
    public async Task EveryAdminEndpoint_NeedsAnAdmin()
    {
        Seeded r = await SeedRestaurantAsync();
        HttpClient guest = _app.CreateClient();
        string site = Site(r.RestaurantId);

        HttpResponseMessage[] responses =
        [
            await guest.GetAsync(site),
            await guest.PutAsJsonAsync(site, Body()),
            await guest.PostAsync($"{site}/publish", null),
            await guest.PostAsync($"{site}/unpublish", null),
            await guest.GetAsync($"{site}/preview"),
            await guest.PostAsync($"{site}/logo", Picture()),
            await guest.DeleteAsync($"{site}/logo"),
            await guest.PostAsync($"{site}/cover", Picture()),
            await guest.DeleteAsync($"{site}/cover"),
            await guest.PostAsync($"{site}/photos", Picture()),
            await guest.PutAsJsonAsync($"{site}/photos/x", new { alt = "x" }),
            await guest.PatchAsJsonAsync($"{site}/photos/reorder", new { ids = Array.Empty<string>() }),
            await guest.DeleteAsync($"{site}/photos/x"),
        ];

        Assert.All(responses, response => Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode));
        Assert.Empty(await InDbAsync(db => db.RestaurantSites.Where(s => s.RestaurantId == r.RestaurantId).ToListAsync()));
    }

    [Fact]
    public async Task AManager_CanEditAndPublishASite()
    {
        Seeded r = await SeedRestaurantAsync();
        HttpClient manager = await ManagerAsync();

        Assert.Equal(HttpStatusCode.OK, (await manager.PutAsJsonAsync(Site(r.RestaurantId), Body())).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await manager.PostAsync($"{Site(r.RestaurantId)}/publish", null)).StatusCode);
    }

    [Fact]
    public async Task AReadKey_ReadsAndPreviews_ButCannotWrite()
    {
        Seeded r = await SeedRestaurantAsync();
        HttpClient key = await KeyAsync(ApiKeyScopes.Sites, ApiKeyScopes.Read);

        Assert.Equal(HttpStatusCode.OK, (await key.GetAsync(Site(r.RestaurantId))).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await key.GetAsync($"{Site(r.RestaurantId)}/preview")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await key.PutAsJsonAsync(Site(r.RestaurantId), Body())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await key.PostAsync($"{Site(r.RestaurantId)}/publish", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await key.PostAsync($"{Site(r.RestaurantId)}/photos", Picture())).StatusCode);
        Assert.Empty(await InDbAsync(db => db.RestaurantSites.Where(s => s.RestaurantId == r.RestaurantId).ToListAsync()));
    }

    [Fact]
    public async Task AWriteKey_Writes_AndAKeyOfAnotherScopeCannotEvenRead()
    {
        Seeded r = await SeedRestaurantAsync();
        HttpClient write = await KeyAsync(ApiKeyScopes.Sites, ApiKeyScopes.Write);
        HttpClient menus = await KeyAsync(ApiKeyScopes.Menus, ApiKeyScopes.Write);
        HttpClient locations = await KeyAsync(ApiKeyScopes.Locations, ApiKeyScopes.Write);

        Assert.Equal(HttpStatusCode.OK, (await write.PutAsJsonAsync(Site(r.RestaurantId), Body())).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await menus.GetAsync(Site(r.RestaurantId))).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await locations.GetAsync(Site(r.RestaurantId))).StatusCode);
    }

    // ── The journey ──────────────────────────────────────────────────────────

    [Fact]
    public async Task ASiteIsInvisibleUntilPublished_ThenServedToAnyone_ThenInvisibleAgain()
    {
        Seeded r = await SeedRestaurantAsync();
        HttpClient owner = Owner();
        HttpClient guest = _app.CreateClient();
        (await owner.PutAsJsonAsync(Site(r.RestaurantId), Body())).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync($"/r/{r.Slug}")).StatusCode);

        (await owner.PostAsync($"{Site(r.RestaurantId)}/publish", null)).EnsureSuccessStatusCode();
        HttpResponseMessage live = await guest.GetAsync($"/r/{r.Slug}");
        Assert.Equal(HttpStatusCode.OK, live.StatusCode);
        Assert.Contains(r.Name, await live.Content.ReadAsStringAsync(), StringComparison.Ordinal);

        (await owner.PostAsync($"{Site(r.RestaurantId)}/unpublish", null)).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await guest.GetAsync($"/r/{r.Slug}")).StatusCode);
    }

    [Fact]
    public async Task ThePublicPage_IsStaticFrenchHtml_WithNoCookieNoScriptAndAStrictPolicy()
    {
        Seeded r = await LiveSiteAsync();

        HttpResponseMessage response = await _app.CreateClient().GetAsync($"/r/{r.Slug}");
        string html = await response.Content.ReadAsStringAsync();

        Assert.Equal("text/html; charset=utf-8", response.Content.Headers.ContentType!.ToString());
        Assert.Equal("public, max-age=60", response.Headers.CacheControl!.ToString());
        Assert.False(response.Headers.Contains("Set-Cookie"));
        Assert.DoesNotMatch(SetCookie(), html);
        Assert.Contains("<html lang=\"fr\">", html, StringComparison.Ordinal);
        Assert.Single(Regex.Matches(html, "<script"));
        Assert.True(html.Length < 60_000, $"{html.Length} bytes");

        string policy = response.Headers.GetValues("Content-Security-Policy").Single();
        Assert.StartsWith("default-src 'none'; img-src 'self'; style-src 'sha256-", policy, StringComparison.Ordinal);
        Assert.Contains($"content=\"{policy.Replace("'", "&#39;", StringComparison.Ordinal)}\"", html, StringComparison.Ordinal);
        Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
    }

    [Fact]
    public async Task ACrawlersHeadRequest_GetsTheSameStatusAndContentTypeAsAGet_NotA405()
    {
        Seeded r = await LiveSiteAsync();
        HttpClient guest = _app.CreateClient();

        HttpResponseMessage live = await guest.SendAsync(new HttpRequestMessage(HttpMethod.Head, $"/r/{r.Slug}"));
        HttpResponseMessage missing = await guest.SendAsync(new HttpRequestMessage(HttpMethod.Head, "/r/no-such-site"));
        HttpResponseMessage sitemap = await guest.SendAsync(new HttpRequestMessage(HttpMethod.Head, "/sitemap.xml"));

        Assert.Equal(HttpStatusCode.OK, live.StatusCode);
        Assert.Equal("text/html; charset=utf-8", live.Content.Headers.ContentType!.ToString());
        Assert.Equal(HttpStatusCode.NotFound, missing.StatusCode);
        Assert.Equal(HttpStatusCode.OK, sitemap.StatusCode);
    }

    [Fact]
    public async Task ThePublicPage_ShowsNoInternalIdentifier()
    {
        Seeded r = await LiveSiteAsync();
        int tableId = await InDbAsync(db => db.Tables.Where(t => t.Section!.RestaurantId == r.RestaurantId).Select(t => t.Id).SingleAsync());
        string tableToken = await InDbAsync(db => db.Tables.Where(t => t.Id == tableId).Select(t => t.PublicToken).SingleAsync());

        string html = await _app.CreateClient().GetStringAsync($"/r/{r.Slug}");

        Assert.DoesNotContain(r.RestaurantToken, html, StringComparison.Ordinal);
        Assert.DoesNotContain(tableToken, html, StringComparison.Ordinal);
        Assert.DoesNotContain($"/locations/{r.RestaurantId}", html, StringComparison.Ordinal);
        Assert.DoesNotContain("restaurantId", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("/api/", html, StringComparison.Ordinal);
        Assert.DoesNotContain("T1", html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task APageThatCannotBeShown_AnswersTheSameBody_WhateverTheReason()
    {
        Seeded draft = await SeedRestaurantAsync();
        await Owner().PutAsJsonAsync(Site(draft.RestaurantId), Body());
        Seeded archived = await LiveSiteAsync();
        (await Owner().PatchAsJsonAsync($"/api/admin/restaurants/{archived.RestaurantId}", new { isArchived = true })).EnsureSuccessStatusCode();
        HttpClient guest = _app.CreateClient();

        HttpResponseMessage[] responses =
        [
            await guest.GetAsync("/r/no-such-site"),
            await guest.GetAsync($"/r/{draft.Slug}"),
            await guest.GetAsync($"/r/{archived.Slug}"),
            await guest.GetAsync("/r/NOT_A_SLUG"),
        ];

        Assert.All(responses, response =>
        {
            Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
            Assert.Equal("text/html; charset=utf-8", response.Content.Headers.ContentType!.ToString());
        });
        string[] bodies = await Task.WhenAll(responses.Select(response => response.Content.ReadAsStringAsync()));
        Assert.Single(bodies.Distinct(StringComparer.Ordinal));
        Assert.Contains("noindex", bodies[0], StringComparison.Ordinal);
    }

    [Fact]
    public async Task ARestoredLocation_ComesBackWithItsSiteStillPublished()
    {
        Seeded r = await LiveSiteAsync();
        HttpClient owner = Owner();
        (await owner.PatchAsJsonAsync($"/api/admin/restaurants/{r.RestaurantId}", new { isArchived = true })).EnsureSuccessStatusCode();
        Assert.Equal(HttpStatusCode.NotFound, (await _app.CreateClient().GetAsync($"/r/{r.Slug}")).StatusCode);

        (await owner.PatchAsJsonAsync($"/api/admin/restaurants/{r.RestaurantId}", new { isArchived = false })).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.OK, (await _app.CreateClient().GetAsync($"/r/{r.Slug}")).StatusCode);
    }

    [Fact]
    public async Task Publishing_IsRefusedWithoutALegalIdentity_AndNothingGoesLive()
    {
        Seeded r = await SeedRestaurantAsync();
        HttpClient owner = Owner();
        (await owner.PutAsJsonAsync(Site(r.RestaurantId), new { theme = "Brasserie" })).EnsureSuccessStatusCode();

        HttpResponseMessage publish = await owner.PostAsync($"{Site(r.RestaurantId)}/publish", null);

        Assert.Equal(HttpStatusCode.BadRequest, publish.StatusCode);
        Assert.Equal(ErrorCodes.SiteNotPublishable, Code(await publish.Content.ReadFromJsonAsync<JsonElement>()));
        Assert.Equal(HttpStatusCode.NotFound, (await _app.CreateClient().GetAsync($"/r/{r.Slug}")).StatusCode);
        JsonElement dto = await owner.GetFromJsonAsync<JsonElement>(Site(r.RestaurantId));
        Assert.Equal(["legal.name", "legal.companyNumber"], dto.GetProperty("missing").EnumerateArray().Select(e => e.GetString()));
    }

    [Fact]
    public async Task APublishedPage_ShowsTheMenu_WithoutTheDraftOrTheHiddenDish()
    {
        Seeded r = await SeedRestaurantAsync();
        HttpClient owner = Owner();
        string menus = $"/api/admin/restaurants/{r.RestaurantId}/menus";
        int menuId = (await (await owner.PostAsJsonAsync(menus, new { name = "Carte" })).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        int categoryId = (await (await owner.PostAsJsonAsync($"{menus}/{menuId}/categories", new { name = "Plats" })).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        string items = $"/api/admin/restaurants/{r.RestaurantId}/menu-categories/{categoryId}/items";
        (await owner.PostAsJsonAsync(items, new { name = "Carbonade flamande", priceMinor = 2200, allergens = new[] { "Gluten" } })).EnsureSuccessStatusCode();
        (await owner.PostAsJsonAsync(items, new { name = "Plat caché", priceMinor = 100, availability = "Hidden" })).EnsureSuccessStatusCode();
        (await owner.PostAsync($"{menus}/{menuId}/publish", null)).EnsureSuccessStatusCode();
        int draftId = (await (await owner.PostAsJsonAsync(menus, new { name = "Brouillon" })).Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
        await owner.PostAsJsonAsync($"{menus}/{draftId}/categories", new { name = "Secrets" });
        await LiveSiteAsync(r);

        string html = await _app.CreateClient().GetStringAsync($"/r/{r.Slug}");

        Assert.Contains("Carbonade flamande", html, StringComparison.Ordinal);
        Assert.Contains("22,00 €", html, StringComparison.Ordinal);
        Assert.Contains("Allergènes : gluten", html, StringComparison.Ordinal);
        Assert.DoesNotContain("Plat caché", html, StringComparison.Ordinal);
        Assert.DoesNotContain("Brouillon", html, StringComparison.Ordinal);
        Assert.DoesNotContain("Secrets", html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task ATextFieldWithMarkup_IsEscapedOnThePage()
    {
        Seeded r = await SeedRestaurantAsync(name: "Le <b>Gras</b> & \"Cie\" " + Guid.NewGuid().ToString("N")[..6]);
        await LiveSiteAsync(r, b => b["tagline"] = "<script>alert('x')</script>");

        string html = await _app.CreateClient().GetStringAsync($"/r/{r.Slug}");

        Assert.DoesNotContain("<script>alert", html, StringComparison.Ordinal);
        Assert.DoesNotContain("<b>Gras</b>", html, StringComparison.Ordinal);
        Assert.Contains("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;", html, StringComparison.Ordinal);
        Assert.Single(Regex.Matches(html, "<script"));
    }

    [Fact]
    public async Task AWalkInOnlyLocation_HasNoBookingButton_AndItsBookingAddressStaysOnThePage()
    {
        Seeded r = await LiveSiteAsync(await SeedRestaurantAsync(walkInOnly: true));

        string html = await _app.CreateClient().GetStringAsync($"/r/{r.Slug}");
        HttpResponseMessage reserve = await GuestWhoStops().GetAsync($"/r/{r.Slug}/reserver");

        Assert.DoesNotContain("Réserver une table", html, StringComparison.Ordinal);
        Assert.Equal(HttpStatusCode.Redirect, reserve.StatusCode);
        Assert.Equal($"/r/{r.Slug}#contact", reserve.Headers.Location!.OriginalString);
    }

    // ── The booking button ───────────────────────────────────────────────────

    [Fact]
    public async Task TheBookingButton_RedirectsToTheLocationsBookingFlow()
    {
        Seeded r = await LiveSiteAsync();

        HttpResponseMessage response = await GuestWhoStops().GetAsync($"/r/{r.Slug}/reserver");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal($"/locations/{r.RestaurantId}", response.Headers.Location!.OriginalString);
    }

    [Fact]
    public async Task TheBookingButton_OfASiteThatIsNotLive_IsA404_NotARedirect()
    {
        Seeded r = await SeedRestaurantAsync();
        await Owner().PutAsJsonAsync(Site(r.RestaurantId), Body());

        HttpResponseMessage response = await _app.CreateClient().GetAsync($"/r/{r.Slug}/reserver");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Null(response.Headers.Location);
    }

    // ── Sitemap and robots ───────────────────────────────────────────────────

    [Fact]
    public async Task TheSitemap_ListsLiveSites_AndNotDraftsOrArchivedOnes()
    {
        Seeded live = await LiveSiteAsync();
        Seeded draft = await SeedRestaurantAsync();
        await Owner().PutAsJsonAsync(Site(draft.RestaurantId), Body());
        Seeded archived = await LiveSiteAsync();
        await Owner().PatchAsJsonAsync($"/api/admin/restaurants/{archived.RestaurantId}", new { isArchived = true });

        HttpResponseMessage response = await _app.CreateClient().GetAsync("/sitemap.xml");
        string xml = await response.Content.ReadAsStringAsync();

        Assert.Equal("application/xml; charset=utf-8", response.Content.Headers.ContentType!.ToString());
        Assert.Contains($"/r/{live.Slug}</loc>", xml, StringComparison.Ordinal);
        Assert.DoesNotContain($"/r/{draft.Slug}<", xml, StringComparison.Ordinal);
        Assert.DoesNotContain($"/r/{archived.Slug}<", xml, StringComparison.Ordinal);
    }

    [Fact]
    public async Task TheRobotsFile_KeepsCrawlersOutOfTheAdmin_AndNamesTheSitemap()
    {
        HttpResponseMessage response = await _app.CreateClient().GetAsync("/robots.txt");
        string text = await response.Content.ReadAsStringAsync();

        Assert.Equal("text/plain; charset=utf-8", response.Content.Headers.ContentType!.ToString());
        Assert.Contains("Disallow: /admin", text, StringComparison.Ordinal);
        Assert.Contains("/sitemap.xml", text, StringComparison.Ordinal);
    }

    // ── Preview ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task Preview_ShowsADraft_MarkedAsOne_AndNeverCached()
    {
        Seeded r = await SeedRestaurantAsync();
        HttpClient owner = Owner();
        (await owner.PutAsJsonAsync(Site(r.RestaurantId), Body())).EnsureSuccessStatusCode();

        HttpResponseMessage response = await owner.GetAsync($"{Site(r.RestaurantId)}/preview");
        string html = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("text/html; charset=utf-8", response.Content.Headers.ContentType!.ToString());
        Assert.Equal("no-store", response.Headers.CacheControl!.ToString());
        Assert.Contains("class=\"draft\"", html, StringComparison.Ordinal);
        Assert.Contains("noindex", html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Preview_ShowsAnotherThemeWithoutSavingIt_AndRefusesAnUnknownOne()
    {
        Seeded r = await SeedRestaurantAsync();
        HttpClient owner = Owner();
        (await owner.PutAsJsonAsync(Site(r.RestaurantId), Body())).EnsureSuccessStatusCode();

        string brasserie = await owner.GetStringAsync($"{Site(r.RestaurantId)}/preview");
        string gastro = await owner.GetStringAsync($"{Site(r.RestaurantId)}/preview?theme=Gastronomique");
        HttpResponseMessage unknown = await owner.GetAsync($"{Site(r.RestaurantId)}/preview?theme=Neon");

        Assert.NotEqual(brasserie, gastro);
        Assert.Equal(HttpStatusCode.BadRequest, unknown.StatusCode);
        Assert.Equal(ErrorCodes.SiteThemeInvalid, Code(await unknown.Content.ReadFromJsonAsync<JsonElement>()));
        Assert.Equal("Brasserie", (await owner.GetFromJsonAsync<JsonElement>(Site(r.RestaurantId))).GetProperty("theme").GetString());
    }

    // ── Editing ──────────────────────────────────────────────────────────────

    [Fact]
    public async Task TheSettingsRoundTrip_AndAnAddressAlreadyTaken_Is409()
    {
        Seeded a = await SeedRestaurantAsync();
        Seeded b = await SeedRestaurantAsync();
        HttpClient owner = Owner();
        string slug = $"taken-{Guid.NewGuid().ToString("N")[..8]}";
        HttpResponseMessage saved = await owner.PutAsJsonAsync(Site(a.RestaurantId), Body(x => x["slug"] = slug));
        JsonElement dto = await saved.Content.ReadFromJsonAsync<JsonElement>();

        HttpResponseMessage clash = await owner.PutAsJsonAsync(Site(b.RestaurantId), Body(x => x["slug"] = slug));

        Assert.Equal(slug, dto.GetProperty("slug").GetString());
        Assert.Equal($"/r/{slug}", dto.GetProperty("publicPath").GetString());
        Assert.Equal("Instagram", dto.GetProperty("socialLinks")[0].GetProperty("kind").GetString());
        Assert.Equal("0123.456.789", dto.GetProperty("legal").GetProperty("companyNumber").GetString());
        Assert.Equal(HttpStatusCode.Conflict, clash.StatusCode);
        Assert.Equal(ErrorCodes.SiteSlugTaken, Code(await clash.Content.ReadFromJsonAsync<JsonElement>()));
    }

    [Theory]
    [InlineData("theme", "Neon", ErrorCodes.SiteThemeInvalid)]
    [InlineData("slug", "Not A Slug", ErrorCodes.SiteSlugInvalid)]
    public async Task ABadValue_Is400WithItsCode_AndWritesNothing(string field, string value, string code)
    {
        Seeded r = await SeedRestaurantAsync();

        HttpResponseMessage response = await Owner().PutAsJsonAsync(Site(r.RestaurantId), Body(b => b[field] = value));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(code, Code(await response.Content.ReadFromJsonAsync<JsonElement>()));
        Assert.Empty(await InDbAsync(db => db.RestaurantSites.Where(s => s.RestaurantId == r.RestaurantId).ToListAsync()));
    }

    [Fact]
    public async Task ASocialLinkThatIsNotHttps_Is400()
    {
        Seeded r = await SeedRestaurantAsync();

        HttpResponseMessage response = await Owner().PutAsJsonAsync(Site(r.RestaurantId),
            Body(b => b["socialLinks"] = new[] { new { kind = "Instagram", url = "javascript:alert(1)" } }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(ErrorCodes.SiteSocialInvalid, Code(await response.Content.ReadFromJsonAsync<JsonElement>()));
    }

    [Fact]
    public async Task EveryChange_LeavesAnAuditEntryNamingTheLocation()
    {
        Seeded r = await SeedRestaurantAsync();
        await Owner().PutAsJsonAsync(Site(r.RestaurantId), Body());
        await Owner().PostAsync($"{Site(r.RestaurantId)}/publish", null);

        string[] actions = await InDbAsync(db => db.AdminAuditEntries
            .Where(e => e.TargetType == AuditTargets.Site && e.TargetId == r.RestaurantId.ToString())
            .Select(e => e.Action).ToArrayAsync());

        Assert.Contains(AuditActions.SiteUpdate, actions);
        Assert.Contains(AuditActions.SitePublish, actions);
    }

    // ── Pictures ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Logo_AndCover_AreStoredResizedUnderRandomNames_AndRemovedOnDelete()
    {
        Seeded r = await SeedRestaurantAsync();
        HttpClient owner = Owner();

        JsonElement logo = await (await owner.PostAsync($"{Site(r.RestaurantId)}/logo", Picture(width: 1200, height: 900))).Content.ReadFromJsonAsync<JsonElement>();
        JsonElement cover = await (await owner.PostAsync($"{Site(r.RestaurantId)}/cover", Picture(width: 3000, height: 2000))).Content.ReadFromJsonAsync<JsonElement>();

        string logoUrl = logo.GetProperty("logoUrl").GetString()!;
        string coverUrl = cover.GetProperty("coverUrl").GetString()!;
        Assert.Matches("^/media/site-logo-[A-Za-z0-9_-]{22}\\.png$", logoUrl);
        Assert.Matches("^/media/site-cover-[A-Za-z0-9_-]{22}\\.jpg$", coverUrl);
        Assert.Contains(Path.GetFileName(logoUrl), Store.Files);

        await owner.DeleteAsync($"{Site(r.RestaurantId)}/logo");
        await owner.DeleteAsync($"{Site(r.RestaurantId)}/cover");

        Assert.DoesNotContain(Path.GetFileName(logoUrl), Store.Files);
        Assert.DoesNotContain(Path.GetFileName(coverUrl), Store.Files);
        JsonElement dto = await owner.GetFromJsonAsync<JsonElement>(Site(r.RestaurantId));
        Assert.Equal(JsonValueKind.Null, dto.GetProperty("logoUrl").ValueKind);
        Assert.Equal(JsonValueKind.Null, dto.GetProperty("coverUrl").ValueKind);
    }

    [Fact]
    public async Task APhoto_NeedsADescription_AFileOfTheTypeItClaims_AndStaysUnderTheCap()
    {
        Seeded r = await SeedRestaurantAsync();
        HttpClient owner = Owner();
        string url = $"{Site(r.RestaurantId)}/photos";
        int before = Store.Files.Count;

        HttpResponseMessage noAlt = await owner.PostAsync(url, Picture(alt: null));
        HttpResponseMessage blankAlt = await owner.PostAsync(url, Picture(alt: "   "));
        HttpResponseMessage gif = await owner.PostAsync(url, Picture("image/gif"));
        HttpResponseMessage notAnImage = await owner.PostAsync(url, Picture(raw: "<html><script>alert(1)</script></html>"u8.ToArray()));
        HttpResponseMessage wrongSignature = await owner.PostAsync(url, Picture("image/png"));
        byte[] huge = new byte[(int)SiteFields.MaxImageBytes + 1];
        RealJpeg(8, 8).CopyTo(huge, 0);
        HttpResponseMessage tooLarge = await owner.PostAsync(url, Picture(raw: huge));

        Assert.Equal(ErrorCodes.SitePhotoAltRequired, Code(await noAlt.Content.ReadFromJsonAsync<JsonElement>()));
        Assert.Equal(ErrorCodes.SitePhotoAltRequired, Code(await blankAlt.Content.ReadFromJsonAsync<JsonElement>()));
        Assert.Equal(ErrorCodes.MediaUnsupportedImageType, Code(await gif.Content.ReadFromJsonAsync<JsonElement>()));
        Assert.Equal(ErrorCodes.MediaUnsupportedImageType, Code(await notAnImage.Content.ReadFromJsonAsync<JsonElement>()));
        Assert.Equal(ErrorCodes.MediaUnsupportedImageType, Code(await wrongSignature.Content.ReadFromJsonAsync<JsonElement>()));
        Assert.Equal(ErrorCodes.SiteImageTooLarge, Code(await tooLarge.Content.ReadFromJsonAsync<JsonElement>()));
        Assert.All(new[] { noAlt, blankAlt, gif, notAnImage, wrongSignature, tooLarge }, x => Assert.Equal(HttpStatusCode.BadRequest, x.StatusCode));
        Assert.Equal(before, Store.Files.Count);
        Assert.Empty(await InDbAsync(db => db.RestaurantSites.Where(s => s.RestaurantId == r.RestaurantId).ToListAsync()));
    }

    [Fact]
    public async Task TheGallery_HoldsSixPhotos_AndTheSeventhIsA409_ThatStoresNothing()
    {
        Seeded r = await SeedRestaurantAsync();
        HttpClient owner = Owner();
        string url = $"{Site(r.RestaurantId)}/photos";
        for (int i = 0; i < SiteContent.MaxPhotos; i++)
        {
            Assert.Equal(HttpStatusCode.OK, (await owner.PostAsync(url, Picture(alt: $"Photo {i}"))).StatusCode);
        }
        int before = Store.Files.Count;

        HttpResponseMessage seventh = await owner.PostAsync(url, Picture(alt: "De trop"));

        Assert.Equal(HttpStatusCode.Conflict, seventh.StatusCode);
        Assert.Equal(ErrorCodes.SitePhotosFull, Code(await seventh.Content.ReadFromJsonAsync<JsonElement>()));
        Assert.Equal(before, Store.Files.Count);
    }

    [Fact]
    public async Task APhoto_CanBeDescribedAgain_Reordered_AndDeleted_AndThePublicPageFollows()
    {
        Seeded r = await LiveSiteAsync();
        HttpClient owner = Owner();
        string url = $"{Site(r.RestaurantId)}/photos";
        await owner.PostAsync(url, Picture(alt: "Première"));
        JsonElement site = await (await owner.PostAsync(url, Picture(alt: "Seconde"))).Content.ReadFromJsonAsync<JsonElement>();
        string first = site.GetProperty("photos")[0].GetProperty("id").GetString()!;
        string second = site.GetProperty("photos")[1].GetProperty("id").GetString()!;

        await owner.PutAsJsonAsync($"{url}/{first}", new { alt = "Une salle chaleureuse" });
        await owner.PatchAsJsonAsync($"{url}/reorder", new { ids = new[] { second, first } });
        string html = await _app.CreateClient().GetStringAsync($"/r/{r.Slug}");

        Assert.True(html.IndexOf("alt=\"Seconde\"", StringComparison.Ordinal) < html.IndexOf("alt=\"Une salle chaleureuse\"", StringComparison.Ordinal));
        Assert.DoesNotContain(first, html, StringComparison.Ordinal);
        Assert.DoesNotContain(second, html, StringComparison.Ordinal);

        string deletedFile = Path.GetFileName(site.GetProperty("photos")[0].GetProperty("url").GetString()!);
        await owner.DeleteAsync($"{url}/{first}");

        Assert.DoesNotContain(deletedFile, Store.Files);
        Assert.DoesNotContain("Une salle chaleureuse", await _app.CreateClient().GetStringAsync($"/r/{r.Slug}"), StringComparison.Ordinal);
    }

    [Fact]
    public async Task ReachingAnotherLocationsPhoto_Is404_AndChangesNothing()
    {
        Seeded a = await SeedRestaurantAsync();
        Seeded b = await SeedRestaurantAsync();
        HttpClient owner = Owner();
        JsonElement mine = await (await owner.PostAsync($"{Site(a.RestaurantId)}/photos", Picture(alt: "Mine"))).Content.ReadFromJsonAsync<JsonElement>();
        string id = mine.GetProperty("photos")[0].GetProperty("id").GetString()!;
        await owner.PutAsJsonAsync(Site(b.RestaurantId), Body());
        int files = Store.Files.Count;

        HttpResponseMessage[] responses =
        [
            await owner.PutAsJsonAsync($"{Site(b.RestaurantId)}/photos/{id}", new { alt = "Stolen" }),
            await owner.DeleteAsync($"{Site(b.RestaurantId)}/photos/{id}"),
            await owner.PatchAsJsonAsync($"{Site(b.RestaurantId)}/photos/reorder", new { ids = new[] { id } }),
        ];

        Assert.Equal(HttpStatusCode.NotFound, responses[0].StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, responses[1].StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, responses[2].StatusCode);
        Assert.Equal("Mine", (await owner.GetFromJsonAsync<JsonElement>(Site(a.RestaurantId))).GetProperty("photos")[0].GetProperty("alt").GetString());
        Assert.Equal(files, Store.Files.Count);
    }

    [Fact]
    public async Task ALocationThatDoesNotExist_Is404_ForEveryAdminEndpoint()
    {
        HttpClient owner = Owner();
        string site = Site(int.MaxValue);

        HttpResponseMessage[] responses =
        [
            await owner.GetAsync(site),
            await owner.PutAsJsonAsync(site, Body()),
            await owner.PostAsync($"{site}/publish", null),
            await owner.GetAsync($"{site}/preview"),
            await owner.PostAsync($"{site}/photos", Picture()),
        ];

        Assert.All(responses, response => Assert.Equal(HttpStatusCode.NotFound, response.StatusCode));
    }

    [Fact]
    public async Task RestaurantPurge_RemovesTheSiteAndItsPictures()
    {
        Seeded r = await SeedRestaurantAsync();
        HttpClient owner = Owner();
        string tag = r.Slug;
        await owner.PostAsync($"{Site(r.RestaurantId)}/logo", Picture());
        await owner.PostAsync($"{Site(r.RestaurantId)}/cover", Picture());
        await owner.PostAsync($"{Site(r.RestaurantId)}/photos", Picture(alt: "A"));
        string[] mine = (await owner.GetFromJsonAsync<JsonElement>(Site(r.RestaurantId)) is var dto
            ? new[] { dto.GetProperty("logoUrl").GetString()!, dto.GetProperty("coverUrl").GetString()!, dto.GetProperty("photos")[0].GetProperty("url").GetString()! }
            : []).Select(Path.GetFileName).ToArray()!;
        Assert.All(mine, file => Assert.Contains(file, Store.Files));

        (await owner.PatchAsJsonAsync($"/api/admin/restaurants/{r.RestaurantId}", new { isArchived = true })).EnsureSuccessStatusCode();
        HttpResponseMessage purge = await owner.DeleteAsync($"/api/admin/restaurants/{r.RestaurantId}");

        Assert.Equal(HttpStatusCode.NoContent, purge.StatusCode);
        Assert.False(await InDbAsync(db => db.RestaurantSites.AnyAsync(s => s.Slug == tag)));
        Assert.All(mine, file => Assert.DoesNotContain(file, Store.Files));
    }
}
