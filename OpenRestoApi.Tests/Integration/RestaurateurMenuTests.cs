using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Domain;
using static OpenRestoApi.Tests.Integration.PlatformHarness;

namespace OpenRestoApi.Tests.Integration;

public sealed class RestaurateurMenuTests(TestWebAppFactory factory) : IClassFixture<TestWebAppFactory>, IDisposable
{
    private readonly PlatformHarness _h = new(factory);
    public void Dispose() => _h.Dispose();

    private async Task<(int Id, HttpClient Client, OnboardingStateDto State)> MenuAsync()
    {
        Invited invited = await _h.InviteAsync("Brasserie Fictive du Nuage");
        HttpClient client = await _h.AcceptAsync(invited);
        var response = await client.PutAsJsonAsync($"/api/onboarding/restaurants/{invited.RestaurantId}/menu", new
        {
            name = "Carte fictive",
            categories = new[] { new { name = "Plats", items = new[] {
                new { name = "Soupe du jour", description = "Légumes de saison", priceMinor = 750, allergens = new[] { "Celery" },
                    translations = new { en = new { name = "Soup of the day", description = "Seasonal vegetables" } } }
            } } },
        });
        response.EnsureSuccessStatusCode();
        return (invited.RestaurantId, client, (await response.Content.ReadFromJsonAsync<OnboardingStateDto>())!);
    }

    [Fact]
    public async Task ServiceChanges_KeepTranslationsPricesAndAllergens_AndReachBothPublicTokens()
    {
        var (id, client, state) = await MenuAsync();
        string path = $"/api/onboarding/restaurants/{id}";
        int itemId = state.Menu.Categories[0].Items[0].Id!.Value;
        var layout = await client.PutAsJsonAsync($"{path}/layout", new { sections = new[] { new { name = "Salle", tables = new[] { new { name = "Table Nuage", seats = 2 } } } } });
        layout.EnsureSuccessStatusCode();
        var tokens = (await client.GetFromJsonAsync<MenuPublicTokensDto>($"{path}/menu/tokens"))!;
        Assert.Single(tokens.Tables);
        await _h.InDbAsync(async db =>
        {
            (await db.Restaurants.FindAsync(id))!.Status = RestaurantStatus.Published;
            (await db.Menus.FirstAsync(m => m.RestaurantId == id)).IsPublished = true;
            await db.SaveChangesAsync();
        });
        foreach (string status in new[] { "SoldOut", "Hidden", "Available" })
        {
            var changed = await client.PutAsJsonAsync($"{path}/menu/items/{itemId}/availability", new { availability = status });
            Assert.Equal(HttpStatusCode.OK, changed.StatusCode);
            var dish = (await changed.Content.ReadFromJsonAsync<MenuItemDto>())!;
            Assert.Equal(750, dish.PriceMinor);
            Assert.Equal("Soup of the day", dish.Translations["en"].Name);
            Assert.Equal(["Celery"], dish.Allergens);
            foreach (string qr in new[] { $"r/{tokens.RestaurantToken}", $"t/{tokens.Tables[0].Token}" })
            {
                var menu = (await _h.Client().GetFromJsonAsync<PublicMenuResponse>($"/api/menus/{qr}"))!;
                var items = menu.Menus.SelectMany(m => m.Categories).SelectMany(c => c.Items).ToList();
                if (status == "Hidden") Assert.Empty(items);
                else Assert.Equal(status, Assert.Single(items).Availability);
            }
        }
    }

    [Fact]
    public async Task InvalidOrForeignItemAndSuspension_AreRefusedWithoutChangingTheDish()
    {
        var (id, client, state) = await MenuAsync();
        var (otherId, _, otherState) = await MenuAsync();
        int itemId = state.Menu.Categories[0].Items[0].Id!.Value;
        int foreignId = otherState.Menu.Categories[0].Items[0].Id!.Value;
        string path = $"/api/onboarding/restaurants/{id}/menu/items";
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PutAsJsonAsync($"{path}/{itemId}/availability", new { availability = "Yesterday" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PutAsJsonAsync($"{path}/{foreignId}/availability", new { availability = "Hidden" })).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.DeleteAsync($"{path}/{foreignId}/photo")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync($"/api/onboarding/restaurants/{otherId}/menu/tokens")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await _h.Client().GetAsync($"/api/onboarding/restaurants/{id}/menu/tokens")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await _h.Operator().PutAsJsonAsync($"{path}/{itemId}/availability", new { availability = "Hidden" })).StatusCode);
        await _h.InDbAsync(async db => { (await db.Restaurants.FindAsync(id))!.Status = RestaurantStatus.Suspended; await db.SaveChangesAsync(); });
        Assert.Equal(HttpStatusCode.Conflict, (await client.PutAsJsonAsync($"{path}/{itemId}/availability", new { availability = "SoldOut" })).StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await client.DeleteAsync($"{path}/{itemId}/photo")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync($"/api/onboarding/restaurants/{id}/menu/tokens")).StatusCode);
        Assert.Equal(MenuItemAvailability.Available, await _h.InDbAsync(async db => (await db.MenuItems.FindAsync(itemId))!.Availability));
    }

    private static MultipartFormDataContent Photo(byte[] bytes, string type)
    {
        var form = new MultipartFormDataContent();
        var content = new ByteArrayContent(bytes);
        content.Headers.ContentType = new MediaTypeHeaderValue(type);
        form.Add(content, "file", "fictif.png");
        return form;
    }

    [Fact]
    public async Task Photos_AcceptAnImage_RejectWrongTypesSizesAndForeignIds_AndCanBeRemoved()
    {
        var (id, client, state) = await MenuAsync();
        var (_, _, other) = await MenuAsync();
        int itemId = state.Menu.Categories[0].Items[0].Id!.Value;
        string path = $"/api/onboarding/restaurants/{id}/menu/items";
        byte[] png = Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=");
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync($"{path}/{itemId}/photo", Photo(png, "text/html"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync($"{path}/{itemId}/photo", Photo([1, 2], "image/png"))).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsync($"{path}/{itemId}/photo", Photo(new byte[2 * 1024 * 1024 + 1], "image/png"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync($"{path}/{other.Menu.Categories[0].Items[0].Id}/photo", Photo(png, "image/png"))).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsync($"{path}/{other.Menu.Categories[0].Items[0].Id}/photo", Photo([1], "text/html"))).StatusCode);
        Assert.Null(await _h.InDbAsync(async db => (await db.MenuItems.FindAsync(itemId))!.ImageUrl));
        Assert.Equal(HttpStatusCode.OK, (await client.PostAsync($"{path}/{itemId}/photo", Photo(png, "image/png"))).StatusCode);
        var refreshed = (await client.GetFromJsonAsync<OnboardingStateDto>($"/api/onboarding/restaurants/{id}"))!;
        Assert.NotNull(refreshed.Menu.Categories[0].Items[0].ImageUrl);
        Assert.Equal(HttpStatusCode.OK, (await client.DeleteAsync($"{path}/{itemId}/photo")).StatusCode);
        Assert.Null(await _h.InDbAsync(async db => (await db.MenuItems.FindAsync(itemId))!.ImageUrl));
    }

    [Fact]
    public async Task InvalidBatch_DoesNotRenameDeleteOrEditAnyPartOfTheMenu()
    {
        var (id, client, state) = await MenuAsync();
        var category = state.Menu.Categories[0];
        var item = category.Items[0];
        foreach (int badId in new[] { int.MaxValue, item.Id!.Value })
        {
            var refused = await client.PutAsJsonAsync($"/api/onboarding/restaurants/{id}/menu", new
            {
                name = "Changed",
                categories = new[] { new { id = category.Id, name = "Changed", items = new[] {
                    new { id = item.Id, name = "Changed", priceMinor = 1 }, new { id = (int?)badId, name = "Bad", priceMinor = 1 }
                } } }
            });
            Assert.Equal(HttpStatusCode.BadRequest, refused.StatusCode);
            var after = (await client.GetFromJsonAsync<OnboardingStateDto>($"/api/onboarding/restaurants/{id}"))!;
            Assert.Equal(state.Menu.Name, after.Menu.Name);
            Assert.Equal(category.Name, after.Menu.Categories[0].Name);
            Assert.Equal(item.Name, Assert.Single(after.Menu.Categories[0].Items).Name);
        }
    }
}
