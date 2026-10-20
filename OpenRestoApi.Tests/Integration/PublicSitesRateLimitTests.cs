using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.AspNetCore.RateLimiting;
using OpenRestoApi.Controllers;

namespace OpenRestoApi.Tests.Integration;

/// <summary>
/// The public pages are anonymous and keyed by a slug anyone can try as often as they like, so they
/// sit on the <c>public</c> per-address limiter. The policy is one attribute on the controller,
/// which a refactor drops silently; these pin that every action is covered and that the named
/// policy is registered, since a policy nobody registered fails only when a request reaches it.
/// </summary>
public class PublicSitesRateLimitTests(TestWebAppFactory factory) : IClassFixture<TestWebAppFactory>
{
    private readonly TestWebAppFactory _factory = factory;

    private static IEnumerable<MethodInfo> Actions() =>
        typeof(PublicSitesController)
            .GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Where(m => m.GetCustomAttributes().OfType<IActionHttpMethodProvider>().Any());

    [Fact]
    public void TheControllerIsAnonymous_AndEveryActionIsUnderThePublicLimiter()
    {
        Assert.NotEmpty(Actions());
        Assert.Equal("public", typeof(PublicSitesController).GetCustomAttribute<EnableRateLimitingAttribute>()?.PolicyName);
        Assert.NotNull(typeof(PublicSitesController).GetCustomAttribute<AllowAnonymousAttribute>());
        Assert.All(Actions(), action =>
        {
            Assert.Null(action.GetCustomAttribute<DisableRateLimitingAttribute>());
            Assert.Null(action.GetCustomAttribute<EnableRateLimitingAttribute>());
        });
    }

    [Theory]
    [InlineData("/r/policy-registration-probe")]
    [InlineData("/r/policy-registration-probe/reserver")]
    public async Task ThePublicPolicyIsRegisteredWithTheLimiter(string path)
    {
        HttpResponseMessage response = await _factory.CreateClient().GetAsync(path);

        Assert.Equal(System.Net.HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public void TheRoutesAreTheAddressesAGuestAndACrawlerExpect()
    {
        string[] routes = Actions()
            .SelectMany(a => a.GetCustomAttributes().OfType<IActionHttpMethodProvider>().OfType<IRouteTemplateProvider>().Select(r => r.Template!))
            .Distinct()
            .Order()
            .ToArray();

        Assert.Equal(["/r/{slug}", "/r/{slug}/reserver", "/robots.txt", "/sitemap.xml"], routes);
    }
}
