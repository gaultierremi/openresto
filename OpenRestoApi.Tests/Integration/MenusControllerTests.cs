using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;
using OpenRestoApi.Infrastructure.Persistence;

namespace OpenRestoApi.Tests.Integration;

/// <summary>
/// The menu module through the real pipeline: the RequireAdmin/RequireOwner policies, the
/// <c>menus</c> API key scope, the restaurant-nested routes that make another restaurant's ids a
/// 404, and the anonymous public endpoints that must never leak an unpublished menu, a hidden
/// row or an internal id.
/// </summary>
public sealed class MenusControllerTests(TestWebAppFactory factory) : IClassFixture<TestWebAppFactory>, IDisposable
{
    /// <summary>Uploads land in memory rather than in the web project's wwwroot/media.</summary>
    private readonly WebApplicationFactory<Program> _app = factory.WithWebHostBuilder(builder =>
        builder.ConfigureServices(services => services.AddSingleton<IMediaStore, InMemoryMediaStore>()));

    private readonly TestWebAppFactory _factory = factory;

    public void Dispose() => _app.Dispose();

    private sealed class InMemoryMediaStore : IMediaStore
    {
        private readonly System.Collections.Concurrent.ConcurrentDictionary<string, byte> _files = new();

        public IReadOnlyCollection<string> Files => _files.Keys.ToList();

        /// <summary>How many bytes the last upload handed over, from wherever the stream was positioned.</summary>
        public long LengthOfLast { get; private set; }

        public Task<string> ReplaceAsync(string slot, string extension, Stream content)
        {
            foreach (string old in _files.Keys.Where(f => f.StartsWith($"{slot}.", StringComparison.Ordinal)))
            {
                _files.TryRemove(old, out _);
            }
            using var copy = new MemoryStream();
            content.CopyTo(copy);
            LengthOfLast = copy.Length;
            string name = $"{slot}.{extension}";
            _files[name] = 0;
            return Task.FromResult(name);
        }

        public void TryDelete(string fileName) => _files.TryRemove(Path.GetFileName(fileName), out _);
    }

    private sealed record Seeded(int RestaurantId, string RestaurantToken, int TableId, string TableToken);

    private async Task<Seeded> SeedRestaurantAsync(bool archived = false)
    {
        using IServiceScope scope = _app.Services.CreateScope();
        AppDbContext db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var restaurant = new Restaurant { Name = $"Menu test {Guid.NewGuid():N}", Timezone = "Europe/Paris", IsArchived = archived };
        var section = new Section { Name = "Room", Restaurant = restaurant };
        var table = new Table { Name = "T7", Seats = 2, Section = section };
        db.AddRange(restaurant, section, table);
        await db.SaveChangesAsync();
        return new Seeded(restaurant.Id, restaurant.PublicToken, table.Id, table.PublicToken);
    }

    private async Task<T> InDbAsync<T>(Func<AppDbContext, Task<T>> query)
    {
        using IServiceScope scope = _app.Services.CreateScope();
        return await query(scope.ServiceProvider.GetRequiredService<AppDbContext>());
    }

    private Task<int> MenuCountAsync(int restaurantId)
        => InDbAsync(db => db.Menus.CountAsync(m => m.RestaurantId == restaurantId));

    private HttpClient Owner()
    {
        HttpClient client = _app.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _factory.GenerateTestJwt());
        return client;
    }

    private async Task<HttpClient> ManagerAsync()
    {
        const string email = "menus-manager@test.com";
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
            name = $"menus-{resource}-{access}-{Guid.NewGuid():N}",
            scopes = new[] { new { resource, access } },
        });
        minted.EnsureSuccessStatusCode();
        string secret = (await minted.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("secret").GetString()!;
        HttpClient client = _app.CreateClient();
        client.DefaultRequestHeaders.Add("X-API-Key", secret);
        return client;
    }

    private static async Task<int> IdOf(HttpResponseMessage response)
    {
        Assert.True(response.IsSuccessStatusCode, await response.Content.ReadAsStringAsync());
        return (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("id").GetInt32();
    }

    private static string Base(int restaurantId) => $"/api/admin/restaurants/{restaurantId}";

    private sealed record Tree(int MenuId, int CategoryId, int ItemId);

    [Fact]
    public async Task DishTranslations_RoundTripToGuests_PreserveLegacyEdits_AndCanBeCleared()
    {
        Seeded r = await SeedRestaurantAsync();
        Tree tree = await CreateTreeAsync(r.RestaurantId, publish: true);
        string path = $"{Base(r.RestaurantId)}/menu-items/{tree.ItemId}";
        var translated = new
        {
            name = "Soupe",
            description = "Légumes",
            primaryLanguage = "fr",
            translations = new { nl = new { name = " Soep ", description = " Groenten " }, en = new { name = "Soup", description = "Vegetables" } }
        };
        (await Owner().PutAsJsonAsync(path, translated)).EnsureSuccessStatusCode();
        var menu = await _app.CreateClient().GetFromJsonAsync<JsonElement>($"/api/menus/r/{r.RestaurantToken}");
        var dish = menu.GetProperty("menus")[0].GetProperty("categories")[0].GetProperty("items")[0];
        Assert.Equal("Soep", dish.GetProperty("translations").GetProperty("nl").GetProperty("name").GetString());
        Assert.Equal("fr", dish.GetProperty("primaryLanguage").GetString());

        (await Owner().PutAsJsonAsync(path, new { name = "Soupe du jour" })).EnsureSuccessStatusCode();
        Assert.Contains("Soep", (await InDbAsync(db => db.MenuItems.SingleAsync(i => i.Id == tree.ItemId))).TranslationsJson!, StringComparison.Ordinal);
        (await Owner().PutAsJsonAsync(path, new { name = "Soupe", translations = new Dictionary<string, object>() })).EnsureSuccessStatusCode();
        Assert.Equal("{}", (await InDbAsync(db => db.MenuItems.SingleAsync(i => i.Id == tree.ItemId))).TranslationsJson);
    }

    [Theory]
    [InlineData("de", "Soup", "", ErrorCodes.MenuLanguageInvalid)]
    [InlineData("nl", "", "", ErrorCodes.MenuLanguageInvalid)]
    [InlineData("nl", "long", "", ErrorCodes.MenuItemNameTooLong)]
    [InlineData("nl", "Soup", "long", ErrorCodes.MenuDescriptionTooLong)]
    public async Task DishTranslations_RefuseInvalidValues_WithoutWriting(string language, string name, string description, string code)
    {
        Seeded r = await SeedRestaurantAsync();
        Tree tree = await CreateTreeAsync(r.RestaurantId);
        var response = await Owner().PutAsJsonAsync($"{Base(r.RestaurantId)}/menu-items/{tree.ItemId}", new
        {
            name = "Must not be saved",
            primaryLanguage = name.Length == 0 ? "de" : "fr",
            translations = new Dictionary<string, object>
            {
                [language] = new
                {
                    name = name == "long" ? new string('x', 101) : name,
                    description = description == "long" ? new string('x', MenuFields.MaxDescriptionLength + 1) : description
                }
            },
        });
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(code, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
        var saved = await InDbAsync(db => db.MenuItems.SingleAsync(i => i.Id == tree.ItemId));
        Assert.Equal("Steak", saved.Name);
        Assert.Null(saved.TranslationsJson);
    }

    /// <summary>A menu with one category and one item, built through the API as an Owner.</summary>
    private async Task<Tree> CreateTreeAsync(int restaurantId, bool publish = false)
    {
        HttpClient owner = Owner();
        int menuId = await IdOf(await owner.PostAsJsonAsync($"{Base(restaurantId)}/menus", new { name = "Lunch" }));
        int categoryId = await IdOf(await owner.PostAsJsonAsync($"{Base(restaurantId)}/menus/{menuId}/categories", new { name = "Mains" }));
        int itemId = await IdOf(await owner.PostAsJsonAsync($"{Base(restaurantId)}/menu-categories/{categoryId}/items",
            new { name = "Steak", priceMinor = 2400, allergens = new[] { "Mustard" } }));
        if (publish)
        {
            (await owner.PostAsync($"{Base(restaurantId)}/menus/{menuId}/publish", null)).EnsureSuccessStatusCode();
        }
        return new Tree(menuId, categoryId, itemId);
    }

    // ── Admin auth and scopes ────────────────────────────────────────────────

    [Fact]
    public async Task AdminEndpoints_RefuseAnAnonymousCaller_AndWriteNothing()
    {
        Seeded r = await SeedRestaurantAsync();
        HttpClient anonymous = _app.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.GetAsync($"{Base(r.RestaurantId)}/menus")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsJsonAsync($"{Base(r.RestaurantId)}/menus", new { name = "Nope" })).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await anonymous.PostAsync($"{Base(r.RestaurantId)}/public-token/regenerate", null)).StatusCode);
        Assert.Equal(0, await MenuCountAsync(r.RestaurantId));
    }

    [Fact]
    public async Task AKeyWithoutTheMenusScope_IsRefused_AndWritesNothing()
    {
        Seeded r = await SeedRestaurantAsync();
        HttpClient key = await KeyAsync(ApiKeyScopes.Locations, ApiKeyScopes.Write);

        Assert.Equal(HttpStatusCode.Forbidden, (await key.GetAsync($"{Base(r.RestaurantId)}/menus")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await key.PostAsJsonAsync($"{Base(r.RestaurantId)}/menus", new { name = "Nope" })).StatusCode);
        Assert.Equal(0, await MenuCountAsync(r.RestaurantId));
    }

    [Fact]
    public async Task AMenusReadKey_ReadsButCannotWrite()
    {
        Seeded r = await SeedRestaurantAsync();
        Tree tree = await CreateTreeAsync(r.RestaurantId);
        HttpClient key = await KeyAsync(ApiKeyScopes.Menus, ApiKeyScopes.Read);

        Assert.Equal(HttpStatusCode.OK, (await key.GetAsync($"{Base(r.RestaurantId)}/menus")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await key.GetAsync($"{Base(r.RestaurantId)}/public-tokens")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await key.PostAsJsonAsync($"{Base(r.RestaurantId)}/menus", new { name = "Nope" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await key.PutAsJsonAsync($"{Base(r.RestaurantId)}/menu-items/{tree.ItemId}", new { name = "Renamed" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await key.DeleteAsync($"{Base(r.RestaurantId)}/menus/{tree.MenuId}")).StatusCode);
        Assert.Equal(1, await MenuCountAsync(r.RestaurantId));
        Assert.Equal("Steak", await InDbAsync(db => db.MenuItems.Where(i => i.Id == tree.ItemId).Select(i => i.Name).SingleAsync()));
    }

    [Fact]
    public async Task AMenusWriteKey_CanCreateAMenu()
    {
        Seeded r = await SeedRestaurantAsync();
        HttpClient key = await KeyAsync(ApiKeyScopes.Menus, ApiKeyScopes.Write);

        HttpResponseMessage response = await key.PostAsJsonAsync($"{Base(r.RestaurantId)}/menus", new { name = "Drinks", currency = "chf" });

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.Equal("CHF", (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("currency").GetString());
        Assert.Equal(1, await MenuCountAsync(r.RestaurantId));
    }

    [Fact]
    public async Task AnInvalidCurrency_IsA400WithItsCode_AndWritesNothing()
    {
        Seeded r = await SeedRestaurantAsync();

        HttpResponseMessage response = await Owner().PostAsJsonAsync($"{Base(r.RestaurantId)}/menus", new { name = "Lunch", currency = "EURO" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(ErrorCodes.MenuCurrencyInvalid, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
        Assert.Equal(0, await MenuCountAsync(r.RestaurantId));
    }

    [Fact]
    public async Task ANonIsoCurrency_IsRefusedOnCreateAndUpdate_AndWritesNothing()
    {
        Seeded r = await SeedRestaurantAsync();
        HttpClient owner = Owner();

        HttpResponseMessage create = await owner.PostAsJsonAsync($"{Base(r.RestaurantId)}/menus", new { name = "Lunch", currency = "ZZZ" });
        Assert.Equal(HttpStatusCode.BadRequest, create.StatusCode);
        Assert.Equal(ErrorCodes.MenuCurrencyInvalid, (await create.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
        Assert.Equal(0, await MenuCountAsync(r.RestaurantId));

        int menuId = await IdOf(await owner.PostAsJsonAsync($"{Base(r.RestaurantId)}/menus", new { name = "Lunch", currency = "USD" }));
        HttpResponseMessage update = await owner.PutAsJsonAsync($"{Base(r.RestaurantId)}/menus/{menuId}", new { name = "Renamed", currency = "ZZZ" });
        Assert.Equal(HttpStatusCode.BadRequest, update.StatusCode);
        Assert.Equal(ErrorCodes.MenuCurrencyInvalid, (await update.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
        Assert.Equal("Lunch|USD", await InDbAsync(db =>
            db.Menus.Where(m => m.Id == menuId).Select(m => m.Name + "|" + m.Currency).SingleAsync()));

        HttpResponseMessage euro = await owner.PutAsJsonAsync($"{Base(r.RestaurantId)}/menus/{menuId}", new { name = "Lunch", currency = "EUR" });
        Assert.Equal(HttpStatusCode.OK, euro.StatusCode);
    }

    [Fact]
    public async Task RestaurantPurge_RemovesCascadedDishPhotos()
    {
        Seeded r = await SeedRestaurantAsync();
        Tree tree = await CreateTreeAsync(r.RestaurantId);
        HttpClient owner = Owner();
        var store = (InMemoryMediaStore)_app.Services.GetRequiredService<IMediaStore>();
        (await owner.PostAsync($"{Base(r.RestaurantId)}/menu-items/{tree.ItemId}/photo", Photo("image/png", 16))).EnsureSuccessStatusCode();
        Assert.Single(store.Files, f => f.StartsWith("dish-", StringComparison.Ordinal));

        (await owner.PatchAsJsonAsync($"/api/admin/restaurants/{r.RestaurantId}", new { isArchived = true })).EnsureSuccessStatusCode();
        HttpResponseMessage purge = await owner.DeleteAsync($"/api/admin/restaurants/{r.RestaurantId}");

        Assert.Equal(HttpStatusCode.NoContent, purge.StatusCode);
        Assert.False(await InDbAsync(db => db.MenuItems.AnyAsync(i => i.Id == tree.ItemId)));
        Assert.DoesNotContain(store.Files, f => f.StartsWith("dish-", StringComparison.Ordinal));
    }

    // ── Another restaurant's rows ────────────────────────────────────────────

    [Fact]
    public async Task ReachingAnotherRestaurantsRows_Is404_AndChangesNothing()
    {
        Seeded a = await SeedRestaurantAsync();
        Seeded b = await SeedRestaurantAsync();
        Tree tree = await CreateTreeAsync(a.RestaurantId);
        HttpClient owner = Owner();
        (await owner.PostAsync($"{Base(a.RestaurantId)}/menu-items/{tree.ItemId}/photo", Photo("image/png", 32))).EnsureSuccessStatusCode();
        string photoUrl = (await InDbAsync(db => db.MenuItems.Where(i => i.Id == tree.ItemId).Select(i => i.ImageUrl).SingleAsync()))!;
        var store = (InMemoryMediaStore)_app.Services.GetRequiredService<IMediaStore>();
        IReadOnlyCollection<string> filesBefore = store.Files;

        HttpResponseMessage[] responses =
        [
            await owner.GetAsync($"{Base(b.RestaurantId)}/menus/{tree.MenuId}"),
            await owner.PostAsync($"{Base(b.RestaurantId)}/menu-items/{tree.ItemId}/photo", Photo("image/png", 32)),
            await owner.DeleteAsync($"{Base(b.RestaurantId)}/menu-items/{tree.ItemId}/photo"),
            await owner.PatchAsJsonAsync($"{Base(b.RestaurantId)}/menus/{tree.MenuId}/categories/reorder", new { ids = new[] { tree.CategoryId } }),
            await owner.PatchAsJsonAsync($"{Base(b.RestaurantId)}/menu-categories/{tree.CategoryId}/items/reorder", new { ids = new[] { tree.ItemId } }),
            await owner.PutAsJsonAsync($"{Base(b.RestaurantId)}/menus/{tree.MenuId}", new { name = "Hijacked" }),
            await owner.PostAsync($"{Base(b.RestaurantId)}/menus/{tree.MenuId}/publish", null),
            await owner.PostAsJsonAsync($"{Base(b.RestaurantId)}/menus/{tree.MenuId}/categories", new { name = "Injected" }),
            await owner.PutAsJsonAsync($"{Base(b.RestaurantId)}/menu-categories/{tree.CategoryId}", new { name = "Hijacked" }),
            await owner.PostAsJsonAsync($"{Base(b.RestaurantId)}/menu-categories/{tree.CategoryId}/items", new { name = "Injected" }),
            await owner.PutAsJsonAsync($"{Base(b.RestaurantId)}/menu-items/{tree.ItemId}", new { name = "Hijacked" }),
            await owner.DeleteAsync($"{Base(b.RestaurantId)}/menu-items/{tree.ItemId}"),
            await owner.DeleteAsync($"{Base(b.RestaurantId)}/menu-categories/{tree.CategoryId}"),
            await owner.DeleteAsync($"{Base(b.RestaurantId)}/menus/{tree.MenuId}"),
            await owner.PostAsync($"{Base(b.RestaurantId)}/tables/{a.TableId}/public-token/regenerate", null),
        ];

        Assert.All(responses, response => Assert.Equal(HttpStatusCode.NotFound, response.StatusCode));
        (string menu, bool published, string category, string item, int categories, int items, string tableToken) = await InDbAsync(async db => (
            await db.Menus.Where(m => m.Id == tree.MenuId).Select(m => m.Name).SingleAsync(),
            await db.Menus.Where(m => m.Id == tree.MenuId).Select(m => m.IsPublished).SingleAsync(),
            await db.MenuCategories.Where(c => c.Id == tree.CategoryId).Select(c => c.Name).SingleAsync(),
            await db.MenuItems.Where(i => i.Id == tree.ItemId).Select(i => i.Name).SingleAsync(),
            await db.MenuCategories.CountAsync(c => c.MenuId == tree.MenuId),
            await db.MenuItems.CountAsync(i => i.CategoryId == tree.CategoryId),
            await db.Tables.Where(t => t.Id == a.TableId).Select(t => t.PublicToken).SingleAsync()));
        Assert.Equal(("Lunch", false, "Mains", "Steak", 1, 1, a.TableToken), (menu, published, category, item, categories, items, tableToken));
        Assert.Equal(0, await MenuCountAsync(b.RestaurantId));
        Assert.Equal(photoUrl, await InDbAsync(db => db.MenuItems.Where(i => i.Id == tree.ItemId).Select(i => i.ImageUrl).SingleAsync()));
        Assert.Equal(filesBefore, store.Files);

        // The menu list is scoped the same way: another restaurant's menu id is not a valid sibling.
        HttpResponseMessage reorderMenus = await owner.PatchAsJsonAsync($"{Base(b.RestaurantId)}/menus/reorder", new { ids = new[] { tree.MenuId } });
        Assert.Equal(HttpStatusCode.BadRequest, reorderMenus.StatusCode);
        Assert.Equal(ErrorCodes.MenuReorderIdsMismatch, (await reorderMenus.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
        Assert.Equal(0, await InDbAsync(db => db.Menus.Where(m => m.Id == tree.MenuId).Select(m => m.SortOrder).SingleAsync()));
    }

    // ── Photos ───────────────────────────────────────────────────────────────

    private static readonly Dictionary<string, byte[]> _magic = new()
    {
        ["image/png"] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
        ["image/jpeg"] = [0xFF, 0xD8, 0xFF, 0xE0],
        ["image/webp"] = [.. "RIFF"u8, 0, 0, 0, 0, .. "WEBP"u8],
    };

    /// <summary>
    /// A multipart upload declaring <paramref name="contentType"/>. By default its bytes start with
    /// that type's real signature; <paramref name="signedAs"/> writes another type's instead, and
    /// <c>null</c> writes none, so a test can declare one thing and send another.
    /// </summary>
    private static MultipartFormDataContent Photo(string contentType, int bytes, string? signedAs = "")
    {
        byte[] content = new byte[bytes];
        string? signature = signedAs == "" ? contentType : signedAs;
        if (signature != null && _magic.TryGetValue(signature, out byte[]? head))
        {
            head.AsSpan(0, Math.Min(head.Length, content.Length)).CopyTo(content);
        }
        var file = new ByteArrayContent(content);
        file.Headers.ContentType = new MediaTypeHeaderValue(contentType);
        return new MultipartFormDataContent { { file, "file", "dish.bin" } };
    }

    [Fact]
    public async Task ItemPhoto_AcceptsAnImageUnderTheCap_AndRefusesTheRest()
    {
        Seeded r = await SeedRestaurantAsync();
        Tree tree = await CreateTreeAsync(r.RestaurantId);
        HttpClient owner = Owner();
        string url = $"{Base(r.RestaurantId)}/menu-items/{tree.ItemId}/photo";

        HttpResponseMessage wrongType = await owner.PostAsync(url, Photo("image/gif", 10));
        HttpResponseMessage tooLarge = await owner.PostAsync(url, Photo("image/png", 2 * 1024 * 1024 + 1));
        Assert.Equal(HttpStatusCode.BadRequest, wrongType.StatusCode);
        Assert.Equal(ErrorCodes.MediaUnsupportedImageType, (await wrongType.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
        Assert.Equal(HttpStatusCode.BadRequest, tooLarge.StatusCode);
        Assert.Equal(ErrorCodes.MenuItemImageTooLarge, (await tooLarge.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
        Assert.Null(await InDbAsync(db => db.MenuItems.Where(i => i.Id == tree.ItemId).Select(i => i.ImageUrl).SingleAsync()));

        HttpResponseMessage ok = await owner.PostAsync(url, Photo("image/png", 2 * 1024 * 1024));
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        string imageUrl = (await ok.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("imageUrl").GetString()!;
        Assert.Matches(@"^/media/dish-[A-Za-z0-9_-]{22}\.png\?v=\d+$", imageUrl);
        Assert.DoesNotContain($"dish-{tree.ItemId}.", imageUrl, StringComparison.Ordinal);

        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync(url)).StatusCode);
        Assert.Null(await InDbAsync(db => db.MenuItems.Where(i => i.Id == tree.ItemId).Select(i => i.ImageUrl).SingleAsync()));
    }

    [Fact]
    public async Task ItemPhoto_IsRefusedWhenItsBytesAreNotTheImageItDeclares_AndWritesNothing()
    {
        Seeded r = await SeedRestaurantAsync();
        Tree tree = await CreateTreeAsync(r.RestaurantId);
        HttpClient owner = Owner();
        var store = (InMemoryMediaStore)_app.Services.GetRequiredService<IMediaStore>();
        string url = $"{Base(r.RestaurantId)}/menu-items/{tree.ItemId}/photo";

        HttpResponseMessage[] refused =
        [
            await owner.PostAsync(url, Photo("image/png", 64, signedAs: null)),
            await owner.PostAsync(url, Photo("image/png", 64, signedAs: "image/jpeg")),
            await owner.PostAsync(url, Photo("image/jpeg", 64, signedAs: "image/webp")),
            await owner.PostAsync(url, Photo("image/webp", 64, signedAs: "image/png")),
            await owner.PostAsync(url, Photo("image/webp", 8)),
        ];

        foreach (HttpResponseMessage response in refused)
        {
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
            Assert.Equal(ErrorCodes.MediaUnsupportedImageType, (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString());
        }
        Assert.Empty(store.Files);
        Assert.Null(await InDbAsync(db => db.MenuItems.Where(i => i.Id == tree.ItemId).Select(i => i.ImageUrl).SingleAsync()));

        foreach (string type in new[] { "image/png", "image/jpeg", "image/webp" })
        {
            Assert.Equal(HttpStatusCode.OK, (await owner.PostAsync(url, Photo(type, 64))).StatusCode);
        }
        Assert.Single(store.Files);
    }

    [Fact]
    public async Task ItemPhoto_IsStoredAsTheCheckedBytes_NotTheEmptyRemainderOfTheStream()
    {
        Seeded r = await SeedRestaurantAsync();
        Tree tree = await CreateTreeAsync(r.RestaurantId);

        HttpResponseMessage response = await Owner().PostAsync($"{Base(r.RestaurantId)}/menu-items/{tree.ItemId}/photo", Photo("image/png", 64));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(64, ((InMemoryMediaStore)_app.Services.GetRequiredService<IMediaStore>()).LengthOfLast);
    }

    // ── Tokens ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task Regenerate_IsRefusedToAManager_AndKeepsTheTokens()
    {
        Seeded r = await SeedRestaurantAsync();
        HttpClient manager = await ManagerAsync();

        Assert.Equal(HttpStatusCode.Forbidden, (await manager.PostAsync($"{Base(r.RestaurantId)}/public-token/regenerate", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await manager.PostAsync($"{Base(r.RestaurantId)}/tables/{r.TableId}/public-token/regenerate", null)).StatusCode);
        Assert.Equal(r.RestaurantToken, await InDbAsync(db => db.Restaurants.Where(x => x.Id == r.RestaurantId).Select(x => x.PublicToken).SingleAsync()));
        Assert.Equal(r.TableToken, await InDbAsync(db => db.Tables.Where(x => x.Id == r.TableId).Select(x => x.PublicToken).SingleAsync()));

        Assert.Equal(HttpStatusCode.OK, (await manager.GetAsync($"{Base(r.RestaurantId)}/menus")).StatusCode);
    }

    [Fact]
    public async Task Regenerate_ByAnOwner_RetiresTheOldPublicLink()
    {
        Seeded r = await SeedRestaurantAsync();
        await CreateTreeAsync(r.RestaurantId, publish: true);
        HttpClient owner = Owner();

        HttpResponseMessage response = await owner.PostAsync($"{Base(r.RestaurantId)}/public-token/regenerate", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        string token = (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("token").GetString()!;
        Assert.Equal(HttpStatusCode.NotFound, (await _app.CreateClient().GetAsync($"/api/menus/r/{r.RestaurantToken}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await _app.CreateClient().GetAsync($"/api/menus/r/{token}")).StatusCode);
        Assert.Equal(AuditActions.MenuTokenRegenerate, await InDbAsync(db => db.AdminAuditEntries
            .Where(e => e.RestaurantId == r.RestaurantId).OrderByDescending(e => e.Id).Select(e => e.Action).FirstAsync()));
    }

    // ── Public endpoints ─────────────────────────────────────────────────────

    [Fact]
    public async Task PublicMenu_ShowsOnlyWhatIsPublishedAndVisible()
    {
        Seeded r = await SeedRestaurantAsync();
        Tree tree = await CreateTreeAsync(r.RestaurantId, publish: true);
        HttpClient owner = Owner();
        await owner.PostAsJsonAsync($"{Base(r.RestaurantId)}/menu-categories/{tree.CategoryId}/items", new { name = "Secret dish", availability = "Hidden" });
        await owner.PostAsJsonAsync($"{Base(r.RestaurantId)}/menu-categories/{tree.CategoryId}/items", new { name = "Last fish", availability = "SoldOut" });
        int hiddenCategory = await IdOf(await owner.PostAsJsonAsync($"{Base(r.RestaurantId)}/menus/{tree.MenuId}/categories", new { name = "Staff only", isVisible = false }));
        await owner.PostAsJsonAsync($"{Base(r.RestaurantId)}/menu-categories/{hiddenCategory}/items", new { name = "Staff meal" });
        int draft = await IdOf(await owner.PostAsJsonAsync($"{Base(r.RestaurantId)}/menus", new { name = "Draft menu" }));
        await owner.PostAsJsonAsync($"{Base(r.RestaurantId)}/menus/{draft}/categories", new { name = "Draft category" });

        foreach (string url in new[] { $"/api/menus/r/{r.RestaurantToken}", $"/api/menus/t/{r.TableToken}" })
        {
            HttpResponseMessage response = await _app.CreateClient().GetAsync(url);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            string json = await response.Content.ReadAsStringAsync();

            Assert.Contains("Steak", json, StringComparison.Ordinal);
            Assert.Contains("Last fish", json, StringComparison.Ordinal);
            Assert.Contains("\"Mustard\"", json, StringComparison.Ordinal);
            Assert.DoesNotContain("Secret dish", json, StringComparison.Ordinal);
            Assert.DoesNotContain("Staff", json, StringComparison.Ordinal);
            Assert.DoesNotContain("Draft", json, StringComparison.Ordinal);
            // The restaurant's own id is the only one a guest is given: it names the booking page.
            Assert.Equal(["id"], IdLikeProperties(JsonDocument.Parse(json).RootElement));
            Assert.Equal(r.RestaurantId, JsonDocument.Parse(json).RootElement.GetProperty("restaurant").GetProperty("id").GetInt32());
        }

        JsonElement byTable = await _app.CreateClient().GetFromJsonAsync<JsonElement>($"/api/menus/t/{r.TableToken}");
        Assert.Equal("T7", byTable.GetProperty("table").GetProperty("name").GetString());
    }

    [Fact]
    public async Task PublicMenu_AnUnpublishedMenu_IsInvisible()
    {
        Seeded r = await SeedRestaurantAsync();
        Tree tree = await CreateTreeAsync(r.RestaurantId, publish: true);
        (await Owner().PostAsync($"{Base(r.RestaurantId)}/menus/{tree.MenuId}/unpublish", null)).EnsureSuccessStatusCode();

        Assert.Equal(HttpStatusCode.NotFound, (await _app.CreateClient().GetAsync($"/api/menus/r/{r.RestaurantToken}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await _app.CreateClient().GetAsync($"/api/menus/t/{r.TableToken}")).StatusCode);
    }

    [Fact]
    public async Task PublicMenu_UnknownTokenArchivedRestaurantAndNothingPublished_AnswerTheSame404()
    {
        Seeded nothingPublished = await SeedRestaurantAsync();
        await CreateTreeAsync(nothingPublished.RestaurantId);
        Seeded archived = await SeedRestaurantAsync();
        await CreateTreeAsync(archived.RestaurantId, publish: true);
        await InDbAsync(async db =>
        {
            Restaurant restaurant = await db.Restaurants.SingleAsync(x => x.Id == archived.RestaurantId);
            restaurant.IsArchived = true;
            return await db.SaveChangesAsync();
        });
        HttpClient guest = _app.CreateClient();

        HttpResponseMessage[] responses =
        [
            await guest.GetAsync("/api/menus/r/AAAAAAAAAAAAAAAAAAAAAA"),
            await guest.GetAsync("/api/menus/t/AAAAAAAAAAAAAAAAAAAAAA"),
            await guest.GetAsync($"/api/menus/r/{archived.RestaurantToken}"),
            await guest.GetAsync($"/api/menus/t/{archived.TableToken}"),
            await guest.GetAsync($"/api/menus/r/{nothingPublished.RestaurantToken}"),
            await guest.GetAsync($"/api/menus/t/{nothingPublished.TableToken}"),
        ];

        Assert.All(responses, response => Assert.Equal(HttpStatusCode.NotFound, response.StatusCode));
        string[] bodies = await Task.WhenAll(responses.Select(response => response.Content.ReadAsStringAsync()));
        Assert.Single(bodies.Distinct(StringComparer.Ordinal));
        Assert.Equal(ErrorCodes.MenuNotFound, JsonDocument.Parse(bodies[0]).RootElement.GetProperty("code").GetString());
    }

    [Fact]
    public async Task PublicMenu_NeedsNoCredentials_AndIgnoresAdminOnes()
    {
        Seeded r = await SeedRestaurantAsync();
        await CreateTreeAsync(r.RestaurantId, publish: true);

        Assert.Equal(HttpStatusCode.OK, (await _app.CreateClient().GetAsync($"/api/menus/r/{r.RestaurantToken}")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await Owner().GetAsync($"/api/menus/r/{r.RestaurantToken}")).StatusCode);
    }

    private static List<string> IdLikeProperties(JsonElement element)
    {
        var found = new List<string>();
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (JsonProperty property in element.EnumerateObject())
                {
                    if (property.Name.EndsWith("id", StringComparison.OrdinalIgnoreCase))
                    {
                        found.Add(property.Name);
                    }
                    found.AddRange(IdLikeProperties(property.Value));
                }
                break;
            case JsonValueKind.Array:
                foreach (JsonElement child in element.EnumerateArray())
                {
                    found.AddRange(IdLikeProperties(child));
                }
                break;
        }
        return found;
    }
}
