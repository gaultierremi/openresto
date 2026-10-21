using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.AspNetCore.RateLimiting;
using OpenRestoApi.Controllers;

namespace OpenRestoApi.Tests.Integration;

/// <summary>
/// The public menu endpoints are anonymous and keyed by a token a guest can try as often as they
/// like, so they sit on the <c>public</c> per-address limiter. The policy is one attribute on the
/// controller, which a refactor drops silently and nothing else would notice — an anonymous,
/// unthrottled token probe. These pin that every action is covered and that the named policy is
/// registered, since a policy nobody registered fails only when a request reaches the endpoint.
/// </summary>
public class PublicMenusRateLimitTests(TestWebAppFactory factory) : IClassFixture<TestWebAppFactory>
{
    private readonly TestWebAppFactory _factory = factory;

    private static IEnumerable<MethodInfo> Actions() =>
        typeof(PublicMenusController)
            .GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Where(m => m.GetCustomAttributes().OfType<IActionHttpMethodProvider>().Any());

    [Fact]
    public void TheControllerIsAnonymous_AndEveryActionIsUnderThePublicLimiter()
    {
        Assert.NotEmpty(Actions());
        Assert.Equal("public", typeof(PublicMenusController).GetCustomAttribute<EnableRateLimitingAttribute>()?.PolicyName);
        Assert.NotNull(typeof(PublicMenusController).GetCustomAttribute<AllowAnonymousAttribute>());
        // No action may opt out of the controller's policy, and none may swap in a looser one.
        Assert.All(Actions(), action =>
        {
            Assert.Null(action.GetCustomAttribute<DisableRateLimitingAttribute>());
            Assert.Null(action.GetCustomAttribute<EnableRateLimitingAttribute>());
        });
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
