using System.Net;

namespace OpenRestoApi.Tests.Integration;

/// <summary>
/// One address, two languages: <c>?lang=</c> first, then <c>Accept-Language</c>, then French, with
/// the response varying on the header and the booking redirect carrying the choice on.
/// </summary>
public sealed partial class SitesControllerTests
{
    private static HttpRequestMessage Get(string path, string? acceptLanguage = null, HttpMethod? method = null)
    {
        var request = new HttpRequestMessage(method ?? HttpMethod.Get, path);
        if (acceptLanguage is not null)
        {
            request.Headers.TryAddWithoutValidation("Accept-Language", acceptLanguage);
        }
        return request;
    }

    [Theory]
    [InlineData(null, null, "fr")]
    [InlineData("nl", null, "nl")]
    [InlineData("fr", null, "fr")]
    [InlineData("nl", "fr-BE,fr;q=0.9", "nl")]
    [InlineData("fr", "nl-BE,nl;q=0.9", "fr")]
    [InlineData("de", "nl-BE,nl;q=0.9,fr;q=0.8", "nl")]
    [InlineData("de", "en-US", "fr")]
    [InlineData("NL", "en-US", "fr")]
    [InlineData(null, "nl-BE,nl;q=0.9,fr;q=0.8", "nl")]
    [InlineData(null, "fr;q=0.5,nl;q=0.9", "nl")]
    [InlineData(null, "en-US", "fr")]
    [InlineData(null, ";;;q=,,", "fr")]
    public async Task ThePublicPage_IsWrittenInTheLanguageTheVisitorAsksFor(string? lang, string? acceptLanguage, string expected)
    {
        Seeded r = await LiveSiteAsync();
        string path = lang is null ? $"/r/{r.Slug}" : $"/r/{r.Slug}?lang={lang}";

        HttpResponseMessage response = await _app.CreateClient().SendAsync(Get(path, acceptLanguage));
        string html = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains($"<html lang=\"{expected}\">", html, StringComparison.Ordinal);
        Assert.Contains(expected == "nl" ? "Reserveer een tafel" : "Réserver une table", html, StringComparison.Ordinal);
        Assert.DoesNotContain(expected == "nl" ? "Réserver une table" : "Reserveer een tafel", html, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(null, null)]
    [InlineData("nl", null)]
    [InlineData(null, "nl-BE,nl;q=0.9")]
    public async Task ThePublicPage_VariesOnTheLanguageHeader_AndStaysCacheable(string? lang, string? acceptLanguage)
    {
        Seeded r = await LiveSiteAsync();
        string path = lang is null ? $"/r/{r.Slug}" : $"/r/{r.Slug}?lang={lang}";

        HttpResponseMessage response = await _app.CreateClient().SendAsync(Get(path, acceptLanguage));

        Assert.Equal("public, max-age=60", response.Headers.CacheControl!.ToString());
        Assert.Contains("Accept-Language", response.Headers.Vary);
    }

    [Fact]
    public async Task ThePublicPage_KeepsItsCanonicalAddressFreeOfTheLanguage_AndPointsItsBookingButtonsAtTheChosenOne()
    {
        Seeded r = await LiveSiteAsync();

        string html = await (await _app.CreateClient().SendAsync(Get($"/r/{r.Slug}?lang=nl"))).Content.ReadAsStringAsync();

        Assert.Matches($"<link rel=\"canonical\" href=\"[^\"?]*/r/{r.Slug}\">", html);
        Assert.Contains($"href=\"/r/{r.Slug}/reserver?lang=nl\"", html, StringComparison.Ordinal);
        Assert.DoesNotContain($"/reserver?lang=fr", html, StringComparison.Ordinal);
    }

    [Fact]
    public async Task AHeadRequest_ForTheOtherLanguage_AnswersLikeAGet()
    {
        Seeded r = await LiveSiteAsync();
        HttpClient guest = _app.CreateClient();

        HttpResponseMessage head = await guest.SendAsync(Get($"/r/{r.Slug}?lang=nl", method: HttpMethod.Head));

        Assert.Equal(HttpStatusCode.OK, head.StatusCode);
        Assert.Contains("Accept-Language", head.Headers.Vary);
        Assert.Equal("public, max-age=60", head.Headers.CacheControl!.ToString());
    }

    // ── The booking button ───────────────────────────────────────────────────

    [Theory]
    [InlineData("nl")]
    [InlineData("fr")]
    public async Task Reserve_ForwardsASupportedLanguageToTheBookingPage(string lang)
    {
        Seeded r = await LiveSiteAsync();

        HttpResponseMessage response = await GuestWhoStops().GetAsync($"/r/{r.Slug}/reserver?lang={lang}");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal($"/locations/{r.RestaurantId}?lang={lang}", response.Headers.Location!.OriginalString);
    }

    [Theory]
    [InlineData("https://evil.example")]
    [InlineData("%2F%2Fevil.example")]
    [InlineData("nl%26next%3Dhttps%3A%2F%2Fevil.example")]
    [InlineData("nl%0D%0ALocation%3A%20https%3A%2F%2Fevil.example")]
    [InlineData("NL")]
    [InlineData("de")]
    [InlineData("nl%20")]
    [InlineData("")]
    public async Task Reserve_DropsAnyOtherLanguageValue_AndKeepsThePathTheServiceReturned(string lang)
    {
        Seeded r = await LiveSiteAsync();

        HttpResponseMessage response = await GuestWhoStops().GetAsync($"/r/{r.Slug}/reserver?lang={lang}");

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal($"/locations/{r.RestaurantId}", response.Headers.Location!.OriginalString);
    }

    [Fact]
    public async Task Reserve_ReadsOnlyTheFirstOfALanguageGivenTwice()
    {
        Seeded r = await LiveSiteAsync();

        HttpResponseMessage response = await GuestWhoStops().GetAsync($"/r/{r.Slug}/reserver?lang=nl&lang=https://evil.example");

        Assert.Equal($"/locations/{r.RestaurantId}?lang=nl", response.Headers.Location!.OriginalString);
    }

    [Fact]
    public async Task Reserve_DoesNotReadTheAcceptLanguageHeader()
    {
        Seeded r = await LiveSiteAsync();

        HttpResponseMessage response = await GuestWhoStops().SendAsync(Get($"/r/{r.Slug}/reserver", "nl-BE,nl;q=0.9"));

        Assert.Equal($"/locations/{r.RestaurantId}", response.Headers.Location!.OriginalString);
    }

    [Fact]
    public async Task Reserve_ForAWalkInOnlyLocation_PutsTheLanguageBeforeTheFragment()
    {
        Seeded r = await LiveSiteAsync(await SeedRestaurantAsync(walkInOnly: true));

        HttpResponseMessage response = await GuestWhoStops().GetAsync($"/r/{r.Slug}/reserver?lang=nl");

        Assert.Equal($"/r/{r.Slug}?lang=nl#contact", response.Headers.Location!.OriginalString);
    }

    // ── The page nobody can see ──────────────────────────────────────────────

    [Theory]
    [InlineData("/r/no-such-site", null, "Page introuvable")]
    [InlineData("/r/no-such-site?lang=nl", null, "Pagina niet gevonden")]
    [InlineData("/r/no-such-site", "nl-BE,nl;q=0.9", "Pagina niet gevonden")]
    [InlineData("/r/no-such-site?lang=fr", "nl", "Page introuvable")]
    [InlineData("/r/no-such-site/reserver?lang=nl", null, "Pagina niet gevonden")]
    [InlineData("/r/no-such-site/reserver", null, "Page introuvable")]
    public async Task AnUnknownAddress_IsA404InTheVisitorsLanguage_ThatNamesNoSite(string path, string? acceptLanguage, string title)
    {
        HttpResponseMessage response = await GuestWhoStops().SendAsync(Get(path, acceptLanguage));
        string html = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Contains($"<title>{title}</title>", html, StringComparison.Ordinal);
        Assert.Contains("Accept-Language", response.Headers.Vary);
        Assert.Null(response.Headers.Location);
    }
}
