using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using OpenRestoApi.Core.Application.Site;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Core;

public partial class SitePageRendererTests
{
    private static string Html(Func<SitePageModel, SitePageModel>? change = null) => SiteSamples.Html(change);

    [GeneratedRegex(@"<img\b[^>]*>", RegexOptions.IgnoreCase)]
    private static partial Regex ImgTag();

    [GeneratedRegex(@"\b(?:src|href)=""(https?:)?//[^""]*""", RegexOptions.IgnoreCase)]
    private static partial Regex AbsoluteReference();

    [GeneratedRegex(@"<script\b[^>]*>", RegexOptions.IgnoreCase)]
    private static partial Regex ScriptTag();

    // ── What is on the page ──────────────────────────────────────────────────

    [Fact]
    public void Render_WritesAFrenchDocumentWithATitleAndADescription()
    {
        string html = Html();

        Assert.StartsWith("<!doctype html>", html, StringComparison.Ordinal);
        Assert.Contains("<html lang=\"fr\">", html, StringComparison.Ordinal);
        Assert.Contains("<title>Brasserie de la Senne Dorée – Carte, horaires et réservation</title>", html, StringComparison.Ordinal);
        Assert.Contains("<meta name=\"description\" content=\"Cuisine belge de saison et bières d&#39;abbaye.", html, StringComparison.Ordinal);
        Assert.Contains("<link rel=\"canonical\" href=\"https://resto.example.be/r/brasserie-de-la-senne-doree\">", html, StringComparison.Ordinal);
        Assert.Contains("<meta property=\"og:image\" content=\"https://resto.example.be/media/site-cover-AbC123.jpg\">", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_KeepsTheDescriptionWithinWhatASearchResultShows()
    {
        string html = Html(m => m with { Tagline = string.Join(' ', Enumerable.Repeat("délicieux", 40)) });

        Match description = Regex.Match(html, "<meta name=\"description\" content=\"([^\"]*)\">");
        Assert.True(WebUtilityDecode(description.Groups[1].Value).Length <= 160);
    }

    [Fact]
    public void Render_ShowsTheNameTheTaglineTheLogoAndTheBookingButton()
    {
        string html = Html();

        Assert.Contains("<h1>Brasserie de la Senne Dorée</h1>", html, StringComparison.Ordinal);
        Assert.Contains("<p class=\"tagline\">Cuisine belge de saison et bières d&#39;abbaye</p>", html, StringComparison.Ordinal);
        Assert.Contains("alt=\"Logo de Brasserie de la Senne Dorée\"", html, StringComparison.Ordinal);
        Assert.Contains("<a class=\"btn\" href=\"/r/brasserie-de-la-senne-doree/reserver\">Réserver une table</a>", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_ListsTheSevenDays_WithTheClosedOneSaidSo()
    {
        string html = Html();

        Assert.Equal(7, Regex.Matches(html, "<th scope=\"row\">").Count);
        Assert.Contains("<th scope=\"row\">Lundi</th><td><span class=\"closed\">Fermé</span></td>", html, StringComparison.Ordinal);
        Assert.Contains("<th scope=\"row\">Mardi</th><td>11:30 – 22:30</td>", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_ShowsTheMenuWithPricesAllergensAndDiets()
    {
        string html = Html();

        Assert.Contains("<h2 id=\"t-carte\">La carte</h2>", html, StringComparison.Ordinal);
        Assert.Contains("22,00 €", html, StringComparison.Ordinal);
        Assert.Contains("Allergènes : gluten, céleri", html, StringComparison.Ordinal);
        Assert.Contains("Prix sur demande", html, StringComparison.Ordinal);
        Assert.Contains("<span class=\"badge\">Épuisé</span><span class=\"badge\">Végétarien</span>", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_LeavesOutACategoryWithNoDish()
        => Assert.DoesNotContain("Vide", Html(), StringComparison.Ordinal);

    [Fact]
    public void Render_LeavesOutTheMenuSectionAndItsLinks_WhenNothingIsPublished()
    {
        string html = Html(m => m with { Menus = [] });

        Assert.DoesNotContain("id=\"carte\"", html, StringComparison.Ordinal);
        Assert.DoesNotContain("href=\"#carte\"", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_ShowsTheGalleryWithADescriptionOnEveryPhoto_AndLazyLoadsIt()
    {
        string html = Html();

        Assert.Equal(3, Regex.Matches(html, "alt=\"(La salle aux banquettes de cuir|Une carbonade flamande|La terrasse en été)\"").Count);
        Assert.Contains("width=\"1200\" height=\"800\" loading=\"lazy\" decoding=\"async\"", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_LeavesOutTheGallery_WhenThereIsNoPhoto()
    {
        string html = Html(m => m with { Photos = [] });

        Assert.DoesNotContain("id=\"galerie\"", html, StringComparison.Ordinal);
        Assert.DoesNotContain("href=\"#galerie\"", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_ShowsAddressMapLinkPhoneEmailAndSocialLinks()
    {
        string html = Html();

        Assert.Contains("<address>Rue des Fabriques 25, 1000 Bruxelles</address>", html, StringComparison.Ordinal);
        Assert.Contains("href=\"https://www.openstreetmap.org/search?query=Rue%20des%20Fabriques%2025%2C%201000%20Bruxelles\" target=\"_blank\" rel=\"noopener noreferrer\"", html, StringComparison.Ordinal);
        Assert.Contains("<a href=\"tel:+3225550123\">+32 2 555 01 23</a>", html, StringComparison.Ordinal);
        Assert.Contains("<a href=\"mailto:bonjour@senne-doree.example\">bonjour@senne-doree.example</a>", html, StringComparison.Ordinal);
        Assert.Contains("href=\"https://instagram.com/senne\" target=\"_blank\" rel=\"noopener noreferrer me\">Instagram", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_ShowsTheLegalNotice_AndTheLinkToThePrivacyPolicy()
    {
        string html = Html();

        Assert.Contains("<h2 id=\"mentions-legales\">Mentions légales</h2>", html, StringComparison.Ordinal);
        Assert.Contains("<dt>Raison sociale</dt><dd>Senne Dorée SRL</dd>", html, StringComparison.Ordinal);
        Assert.Contains("<dt>N° d’entreprise</dt><dd>0123.456.789</dd>", html, StringComparison.Ordinal);
        Assert.Contains("<dt>N° de TVA</dt><dd>BE 0123.456.789</dd>", html, StringComparison.Ordinal);
        Assert.Contains("href=\"https://resto.example.be/confidentialite\"", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_FallsBackToTheLocationsAddressForTheRegisteredOffice()
    {
        string html = Html(m => m with { LegalAddress = null });

        Assert.Contains("<dt>Siège</dt><dd>Rue des Fabriques 25, 1000 Bruxelles</dd>", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_OmitsAPhoneAndAnEmail_ItDoesNotHave()
    {
        string html = Html(m => m with { Phone = null, Email = null });

        Assert.DoesNotContain("tel:", html, StringComparison.Ordinal);
        Assert.DoesNotContain("mailto:", html, StringComparison.Ordinal);
        Assert.DoesNotContain(">Appeler<", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_OmitsThePrivacyLink_WhenTheInstanceHasNoPolicy()
        => Assert.DoesNotContain("Politique de confidentialité", Html(m => m with { PrivacyPolicyUrl = null }), StringComparison.Ordinal);

    // ── Walk-in only and drafts ──────────────────────────────────────────────

    [Fact]
    public void Render_DropsEveryBookingButton_ForAWalkInOnlyLocation_AndSaysSo()
    {
        string html = Html(m => m with { WalkInOnly = true });

        Assert.DoesNotContain("Réserver une table", html, StringComparison.Ordinal);
        Assert.DoesNotContain("/reserver", html, StringComparison.Ordinal);
        Assert.DoesNotContain("class=\"book-bar\"", html, StringComparison.Ordinal);
        Assert.Contains("Pas de réservation en ligne", html, StringComparison.Ordinal);
        Assert.Contains("Carte, horaires et contact</title>", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_KeepsTheBookingButton_ForALocationThatTakesBookings()
    {
        string html = Html();

        Assert.Equal(3, Regex.Matches(html, "href=\"/r/brasserie-de-la-senne-doree/reserver\"").Count);
        Assert.Contains("class=\"book-bar\"", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_MarksADraft_AsNotIndexableWithABanner()
    {
        string html = Html(m => m with { IsDraft = true });

        Assert.Contains("<meta name=\"robots\" content=\"noindex,nofollow\">", html, StringComparison.Ordinal);
        Assert.Contains("class=\"draft\"", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_LetsALivePageBeIndexed_WithNoBanner()
    {
        string html = Html();

        Assert.Contains("<meta name=\"robots\" content=\"index,follow,max-image-preview:large\">", html, StringComparison.Ordinal);
        Assert.DoesNotContain("class=\"draft\"", html, StringComparison.Ordinal);
    }

    // ── Nothing third-party, nothing executable ──────────────────────────────

    [Fact]
    public void Render_LoadsNothingFromAnotherOrigin()
    {
        string html = Html();

        // Every absolute reference is a link the visitor follows (maps, social, privacy policy, the
        // canonical address); none is a resource the page fetches by itself.
        string[] followed =
        [
            "https://www.openstreetmap.org/", "https://facebook.com/senne", "https://instagram.com/senne",
            "https://resto.example.be/confidentialite", "https://resto.example.be/r/brasserie-de-la-senne-doree",
        ];
        foreach (Match reference in AbsoluteReference().Matches(html))
        {
            Assert.Contains(followed, f => reference.Value.Contains(f, StringComparison.Ordinal));
        }

        Assert.DoesNotContain("<link rel=\"stylesheet\"", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<iframe", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("<video", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("@import", html, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Render_HasNoScript_ExceptTheStructuredDataBlock()
    {
        string html = Html();

        MatchCollection scripts = ScriptTag().Matches(html);
        Assert.Single(scripts);
        Assert.Equal("<script type=\"application/ld+json\">", scripts[0].Value);
        Assert.DoesNotContain(" onclick=", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(" onerror=", html, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Render_SetsNoCookie_AndShipsNoCookieBanner()
    {
        string html = Html();

        Assert.DoesNotContain("set-cookie", html, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("document.cookie", html, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("n’utilise aucun cookie", html, StringComparison.Ordinal);
    }

    [Fact]
    public void ContentSecurityPolicy_AllowsOnlyThisOriginsImagesAndTheOneStylesheetByItsHash()
    {
        RenderedSitePage page = SitePageRenderer.Render(SiteSamples.Full());

        Match style = Regex.Match(page.Html, "<style>(.*?)</style>", RegexOptions.Singleline);
        string hash = Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(style.Groups[1].Value)));
        Assert.Equal(
            $"default-src 'none'; img-src 'self'; style-src 'sha256-{hash}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
            page.ContentSecurityPolicy);
        Assert.Contains("http-equiv=\"Content-Security-Policy\"", page.Html, StringComparison.Ordinal);
    }

    [Fact]
    public void ContentSecurityPolicy_ChangesWithTheTheme_BecauseTheStylesheetDoes()
        => Assert.NotEqual(
            SitePageRenderer.Render(SiteSamples.Full()).ContentSecurityPolicy,
            SitePageRenderer.Render(SiteSamples.Full(m => m with { Theme = SiteTheme.Cafe })).ContentSecurityPolicy);

    [Fact]
    public void Render_IsByteIdenticalForTheSameModel_SoItCanBeCachedAndHashed()
        => Assert.Equal(Html(), Html());

    // ── Escaping ─────────────────────────────────────────────────────────────

    [Fact]
    public void Render_EscapesEveryTextFieldAThirdPartyCanWrite()
    {
        const string attack = "<script>alert(1)</script>\"'&";
        string html = Html(m => m with
        {
            Name = attack,
            Tagline = attack,
            Address = attack,
            Phone = "+32 " + attack,
            LegalName = attack,
            CompanyNumber = attack,
            VatNumber = attack,
            LegalAddress = attack,
            Cuisines = [attack],
            Photos = [new SitePhoto("p", "/media/x.jpg", attack, 10, 10)],
            Menus = [new PublicMenuView(attack, attack, "EUR", [new PublicMenuCategoryView(attack, attack, [new PublicMenuItemView(attack, attack, 100, null, false, Allergens.None, DietaryTags.None)])])],
        });

        Assert.DoesNotContain("<script>alert", html, StringComparison.Ordinal);
        Assert.Single(ScriptTag().Matches(html));
        Assert.Contains("&lt;script&gt;alert(1)&lt;/script&gt;", html, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("data:text/html,<script>alert(1)</script>")]
    [InlineData("http://insecure.example/x")]
    [InlineData("ftp://x.example/y")]
    [InlineData("/relative")]
    public void Render_DropsASocialLinkThatIsNotAnHttpsAddress(string url)
    {
        string html = Html(m => m with { SocialLinks = [new SiteSocialLink("Instagram", url)] });

        Assert.DoesNotContain("Réseaux sociaux", html, StringComparison.Ordinal);
        Assert.DoesNotContain(url, html, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("data:text/html;base64,AAAA")]
    [InlineData("/relative")]
    public void Render_DropsAPrivacyLinkThatIsNotAWebAddress(string url)
        => Assert.DoesNotContain("Politique de confidentialité", Html(m => m with { PrivacyPolicyUrl = url }), StringComparison.Ordinal);

    [Theory]
    [InlineData("https://tracker.example/pixel.png")]
    [InlineData("//tracker.example/pixel.png")]
    [InlineData("/other/path.png")]
    [InlineData("/media/../secret.png")]
    [InlineData("/media//x.png")]
    [InlineData("javascript:alert(1)")]
    public void Render_NeverLoadsAnImageFromOutsideTheMediaDirectory(string url)
    {
        string html = Html(m => m with
        {
            LogoUrl = url,
            CoverUrl = url,
            Photos = [new SitePhoto("p", url, "x", 10, 10)],
            Menus = [new PublicMenuView("M", null, "EUR", [new PublicMenuCategoryView("C", null, [new PublicMenuItemView("D", null, 1, url, false, Allergens.None, DietaryTags.None)])])],
        });

        Assert.Empty(ImgTag().Matches(html));
    }

    [Fact]
    public void Render_StillLoadsImagesFromTheMediaDirectory_WithACacheBustingQuery()
    {
        string html = Html(m => m with { CoverUrl = "/media/hero.jpg?v=123" });

        Assert.Contains("src=\"/media/hero.jpg?v=123\"", html, StringComparison.Ordinal);
    }

    // ── Accessibility ────────────────────────────────────────────────────────

    [Fact]
    public void Render_GivesEveryImageAnAltAttribute_AndTheCoverAnEmptyOne()
    {
        string html = Html();

        foreach (Match img in ImgTag().Matches(html))
        {
            Assert.Contains(" alt=\"", img.Value, StringComparison.Ordinal);
        }
        Assert.Contains("class=\"cover\" src=\"/media/site-cover-AbC123.jpg\" alt=\"\"", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_OffersASkipLink_ALandmarkStructure_AndOneH1()
    {
        string html = Html();

        Assert.Contains("<a class=\"skip\" href=\"#contenu\">", html, StringComparison.Ordinal);
        Assert.Contains("<main id=\"contenu\">", html, StringComparison.Ordinal);
        Assert.Contains("<nav class=\"sections\" aria-label=", html, StringComparison.Ordinal);
        Assert.Contains("<header class=\"hero has-cover\">", html, StringComparison.Ordinal);
        Assert.Contains("<footer>", html, StringComparison.Ordinal);
        Assert.Single(Regex.Matches(html, "<h1>"));
    }

    [Fact]
    public void Render_TellsAScreenReaderWhichLinksOpenANewTab()
    {
        string html = Html();

        Assert.Equal(
            Regex.Matches(html, "target=\"_blank\"").Count,
            Regex.Matches(html, "s’ouvre dans un nouvel onglet").Count);
    }

    [Fact]
    public void Render_DoesWithoutACoverOrLogo()
    {
        string html = Html(m => m with { CoverUrl = null, LogoUrl = null });

        Assert.Contains("<header class=\"hero\">", html, StringComparison.Ordinal);
        Assert.DoesNotContain("class=\"cover\"", html, StringComparison.Ordinal);
        Assert.DoesNotContain("class=\"logo\"", html, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(SiteTheme.Brasserie)]
    [InlineData(SiteTheme.Gastronomique)]
    [InlineData(SiteTheme.Cafe)]
    public void Render_PaintsEachThemeWithItsOwnStylesheet(SiteTheme theme)
    {
        string html = Html(m => m with { Theme = theme });

        Assert.Contains($"--bg:{SiteThemes.PaletteFor(theme, "#b45309").Background.Hex}", html, StringComparison.Ordinal);
    }

    private static string WebUtilityDecode(string value) => System.Net.WebUtility.HtmlDecode(value);
}
