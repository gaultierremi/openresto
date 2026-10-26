using System.Net;
using System.Net.Http.Json;
using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using OpenRestoApi.Controllers;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Domain;
using OpenRestoApi.Infrastructure.Persistence;

namespace OpenRestoApi.Tests.Integration;

/// <summary>
/// Anonymous token probes stay bounded; dish analytics cannot consume the browsing quota.
/// </summary>
public class PublicMenusRateLimitTests(TestWebAppFactory factory) : IClassFixture<TestWebAppFactory>
{
    private readonly TestWebAppFactory _factory = factory;

    private static IEnumerable<MethodInfo> Actions() =>
        typeof(PublicMenusController)
            .GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Where(m => m.GetCustomAttributes().OfType<IActionHttpMethodProvider>().Any());

    [Fact]
    public void TheControllerIsAnonymous_AndOnlyViewsHaveADedicatedLimiter()
    {
        Assert.NotEmpty(Actions());
        Assert.Equal("public", typeof(PublicMenusController).GetCustomAttribute<EnableRateLimitingAttribute>()?.PolicyName);
        Assert.NotNull(typeof(PublicMenusController).GetCustomAttribute<AllowAnonymousAttribute>());
        Assert.All(Actions(), action =>
        {
            Assert.Null(action.GetCustomAttribute<DisableRateLimitingAttribute>());
            Assert.Equal(action.Name == nameof(PublicMenusController.RecordView) ? "dish-views" : null,
                action.GetCustomAttribute<EnableRateLimitingAttribute>()?.PolicyName);
        });
    }

    [Theory]
    [InlineData("Development")]
    [InlineData("Production")]
    public async Task DishViews_HaveTheirOwnBoundedQuota_AndCannotExhaustPublicBrowsing(string environment)
    {
        using var app = _factory.WithWebHostBuilder(builder => builder.UseEnvironment(environment));
        using IServiceScope scope = app.Services.CreateScope();
        AppDbContext db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var restaurant = new Restaurant { Name = "Carte et quota" };
        var table = new Table { Name = "T1", Seats = 2, Section = new Section { Name = "Salle", Restaurant = restaurant } };
        var dish = new MenuItem { Name = "Plat", Category = new MenuCategory
            { Name = "Plats", Menu = new Menu { Name = "Carte", IsPublished = true, Restaurant = restaurant } } };
        db.AddRange(table, dish);
        await db.SaveChangesAsync();
        using HttpClient client = app.CreateClient();
        string menuPath = $"/api/menus/r/{restaurant.PublicToken}";
        PublicMenuResponse menu = (await client.GetFromJsonAsync<PublicMenuResponse>(menuPath))!;
        string viewToken = Assert.Single(Assert.Single(Assert.Single(menu.Menus).Categories).Items).ViewToken;
        string viewPath = $"{menuPath}/views/{viewToken}";

        for (int i = 0; i < 1200; i++)
        {
            using HttpResponseMessage recorded = await client.PostAsync(viewPath, null);
            Assert.Equal(HttpStatusCode.NoContent, recorded.StatusCode);
        }
        for (int i = 0; i < 3; i++)
        {
            using HttpResponseMessage refused = await client.PostAsync(viewPath, null);
            Assert.Equal(HttpStatusCode.TooManyRequests, refused.StatusCode);
        }
        Assert.Equal(1200, await db.MenuItems.Where(i => i.Id == dish.Id).Select(i => i.QrViews).SingleAsync());

        foreach (string path in new[] { menuPath, $"/api/menus/t/{table.PublicToken}", "/api/restaurants" })
        {
            using HttpResponseMessage readable = await client.GetAsync(path);
            Assert.Equal(HttpStatusCode.OK, readable.StatusCode);
        }

        for (int i = 4; i < 120; i++)
        {
            using HttpResponseMessage readable = await client.GetAsync(menuPath);
            Assert.Equal(HttpStatusCode.OK, readable.StatusCode);
        }
        using HttpResponseMessage browsingRefused = await client.GetAsync(menuPath);
        Assert.Equal(HttpStatusCode.TooManyRequests, browsingRefused.StatusCode);
        Assert.Equal(1200, await db.MenuItems.Where(i => i.Id == dish.Id).Select(i => i.QrViews).SingleAsync());
    }

    [Theory]
    [InlineData("/api/menus/r/policy-registration-probe")]
    [InlineData("/api/menus/t/policy-registration-probe")]
    public async Task ThePublicPolicyIsRegisteredWithTheLimiter(string path)
    {
        HttpResponseMessage response = await _factory.CreateClient().GetAsync(path);

        Assert.Equal(System.Net.HttpStatusCode.NotFound, response.StatusCode);
    }
}
