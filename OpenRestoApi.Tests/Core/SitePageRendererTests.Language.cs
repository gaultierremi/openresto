using System.Reflection;
using System.Text.RegularExpressions;
using OpenRestoApi.Core.Application.Site;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Core;

public partial class SitePageRendererTests
{
    private const string Nbsp = " ";

    private static string Dutch(Func<SitePageModel, SitePageModel>? change = null)
        => Html(m => change is null ? m with { Language = "nl" } : change(m with { Language = "nl" }));

    // ── The document says which language it is ───────────────────────────────

    [Fact]
    public void Render_DeclaresDutch_InTheDocumentTheOpenGraphLocaleAndTheStructuredData()
    {
        string html = Dutch();

        Assert.Contains("<html lang=\"nl\">", html, StringComparison.Ordinal);
        Assert.Contains("<meta property=\"og:locale\" content=\"nl_BE\">", html, StringComparison.Ordinal);
        Assert.Contains("\"inLanguage\":\"nl\"", html, StringComparison.Ordinal);
        Assert.DoesNotContain("<html lang=\"fr\">", html, StringComparison.Ordinal);
        Assert.DoesNotContain("fr_BE", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_DeclaresFrench_ByDefault()
    {
        string html = Html();

        Assert.Contains("<html lang=\"fr\">", html, StringComparison.Ordinal);
        Assert.Contains("<meta property=\"og:locale\" content=\"fr_BE\">", html, StringComparison.Ordinal);
        Assert.Contains("\"inLanguage\":\"fr\"", html, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("de")]
    [InlineData("")]
    [InlineData("NL")]
    [InlineData("\"><script>alert(1)</script>")]
    public void Render_ReadsAnyOtherLanguageAsFrench_AndNeverEchoesIt(string language)
    {
        string html = Html(m => m with { Language = language });

        Assert.Contains("<html lang=\"fr\">", html, StringComparison.Ordinal);
        Assert.Contains(">Réserver une table<", html, StringComparison.Ordinal);
        Assert.Single(ScriptTag().Matches(html));
    }

    [Theory]
    [InlineData("fr")]
    [InlineData("nl")]
    public void Render_KeepsTheCanonicalAddressFreeOfTheLanguage_AndLinksBothVersions(string language)
    {
        string html = Html(m => m with { Language = language });

        Assert.Contains("<link rel=\"canonical\" href=\"https://resto.example.be/r/brasserie-de-la-senne-doree\">", html, StringComparison.Ordinal);
        Assert.Contains("<link rel=\"alternate\" hreflang=\"fr\" href=\"https://resto.example.be/r/brasserie-de-la-senne-doree?lang=fr\">", html, StringComparison.Ordinal);
        Assert.Contains("<link rel=\"alternate\" hreflang=\"nl\" href=\"https://resto.example.be/r/brasserie-de-la-senne-doree?lang=nl\">", html, StringComparison.Ordinal);
        Assert.Contains("<link rel=\"alternate\" hreflang=\"x-default\" href=\"https://resto.example.be/r/brasserie-de-la-senne-doree\">", html, StringComparison.Ordinal);
        Assert.Contains("<meta property=\"og:url\" content=\"https://resto.example.be/r/brasserie-de-la-senne-doree\">", html, StringComparison.Ordinal);
    }

    // ── The switch ───────────────────────────────────────────────────────────

    [Fact]
    public void Render_OffersASwitchOfPlainLinks_MarkingTheCurrentLanguage()
    {
        string dutch = Dutch();

        Assert.Contains("<nav class=\"lang\" aria-label=\"Taal\">", dutch, StringComparison.Ordinal);
        Assert.Contains("<a href=\"/r/brasserie-de-la-senne-doree?lang=fr\" lang=\"fr\" hreflang=\"fr\" aria-label=\"Français\">FR</a>", dutch, StringComparison.Ordinal);
        Assert.Contains("<a href=\"/r/brasserie-de-la-senne-doree?lang=nl\" lang=\"nl\" hreflang=\"nl\" aria-label=\"Nederlands\" aria-current=\"true\">NL</a>", dutch, StringComparison.Ordinal);
        Assert.Single(Regex.Matches(dutch, "aria-current=\"true\""));
        Assert.Single(ScriptTag().Matches(dutch));
    }

    [Fact]
    public void Render_MarksFrenchAsCurrent_OnAFrenchPage()
    {
        string french = Html();

        Assert.Contains("<nav class=\"lang\" aria-label=\"Langue\">", french, StringComparison.Ordinal);
        Assert.Contains("aria-label=\"Français\" aria-current=\"true\">FR</a>", french, StringComparison.Ordinal);
        Assert.DoesNotContain("aria-label=\"Nederlands\" aria-current", french, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("fr")]
    [InlineData("nl")]
    public void Render_PassesTheChosenLanguageToEveryBookingLink_ButNotToTheStructuredData(string language)
    {
        string html = Html(m => m with { Language = language });

        Assert.Equal(3, Regex.Matches(html, $"href=\"/r/brasserie-de-la-senne-doree/reserver\\?lang={language}\"").Count);
        Assert.Contains("\"urlTemplate\":\"https://resto.example.be/r/brasserie-de-la-senne-doree/reserver\"", html, StringComparison.Ordinal);
    }

    // ── What the Dutch page says ─────────────────────────────────────────────

    [Fact]
    public void Render_WritesADutchTitleAndDescription()
    {
        string html = Dutch(m => m with { Tagline = null });

        Assert.Contains("<title>Brasserie de la Senne Dorée – Menukaart, openingsuren en reservatie</title>", html, StringComparison.Ordinal);
        Assert.Contains("<meta name=\"description\" content=\"Brasserie de la Senne Dorée, restaurant. Rue des Fabriques 25, 1000 Bruxelles. Menukaart, openingsuren en online reservatie.\">", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_ListsTheSevenDaysInDutch_WithTheClosedOneSaidSo()
    {
        string html = Dutch();

        Assert.Equal(7, Regex.Matches(html, "<th scope=\"row\">").Count);
        Assert.Contains("<th scope=\"row\">Maandag</th><td><span class=\"closed\">Gesloten</span></td>", html, StringComparison.Ordinal);
        Assert.Contains($"<th scope=\"row\">Dinsdag</th><td>11:30{Nbsp}–{Nbsp}22:30</td>", html, StringComparison.Ordinal);
        Assert.Contains("<h2 id=\"t-horaires\">Openingsuren</h2>", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_ShowsTheDutchMenuWithPricesAllergensAndDiets()
    {
        string html = Dutch();

        Assert.Contains("<h2 id=\"t-carte\">De menukaart</h2>", html, StringComparison.Ordinal);
        Assert.Contains($"€{Nbsp}22,00", html, StringComparison.Ordinal);
        Assert.DoesNotContain($"22,00{Nbsp}€", html, StringComparison.Ordinal);
        Assert.Contains("Allergenen: gluten, selderij", html, StringComparison.Ordinal);
        Assert.Contains("Prijs op aanvraag", html, StringComparison.Ordinal);
        Assert.Contains("<span class=\"badge\">Uitverkocht</span><span class=\"badge\">Vegetarisch</span>", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_ShowsTheDutchHeaderNavigationAndContact()
    {
        string html = Dutch();

        Assert.Contains("alt=\"Logo van Brasserie de la Senne Dorée\"", html, StringComparison.Ordinal);
        Assert.Contains("<a class=\"skip\" href=\"#contenu\">Naar de inhoud</a>", html, StringComparison.Ordinal);
        Assert.Contains("<a class=\"btn\" href=\"/r/brasserie-de-la-senne-doree/reserver?lang=nl\">Reserveer een tafel</a>", html, StringComparison.Ordinal);
        Assert.Contains("<a class=\"btn alt\" href=\"#carte\">Bekijk de menukaart</a>", html, StringComparison.Ordinal);
        Assert.Contains("<li><a href=\"#horaires\">Openingsuren</a></li>", html, StringComparison.Ordinal);
        Assert.Contains("<h2 id=\"t-contact\">Zo vindt u ons</h2>", html, StringComparison.Ordinal);
        Assert.Contains("<p>Telefoon: <a href=\"tel:+3225550123\">", html, StringComparison.Ordinal);
        Assert.Contains("Bekijk op de kaart<span class=\"sr-only\"> (opent in een nieuw tabblad)</span>", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_ShowsTheDutchLegalNotice()
    {
        string html = Dutch();

        Assert.Contains("<h2 id=\"mentions-legales\">Wettelijke vermeldingen</h2>", html, StringComparison.Ordinal);
        Assert.Contains("<dt>Maatschappelijke benaming</dt><dd>Senne Dorée SRL</dd>", html, StringComparison.Ordinal);
        Assert.Contains("<dt>Ondernemingsnummer</dt><dd>0123.456.789</dd>", html, StringComparison.Ordinal);
        Assert.Contains("<dt>btw-nummer</dt><dd>BE 0123.456.789</dd>", html, StringComparison.Ordinal);
        Assert.Contains("Privacybeleid<span class=\"sr-only\"> (opent in een nieuw tabblad)</span>", html, StringComparison.Ordinal);
        Assert.Contains("gebruikt geen cookies", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_SaysSoInDutch_ForAWalkInOnlyLocation_AndAForADraft()
    {
        string html = Dutch(m => m with { WalkInOnly = true, IsDraft = true });

        Assert.DoesNotContain("Reserveer een tafel", html, StringComparison.Ordinal);
        Assert.DoesNotContain("/reserver", html, StringComparison.Ordinal);
        Assert.Contains("Geen online reservatie", html, StringComparison.Ordinal);
        Assert.Contains("Menukaart, openingsuren en contact</title>", html, StringComparison.Ordinal);
        Assert.Contains("<div class=\"draft\" role=\"status\">Voorbeeld – deze website is niet gepubliceerd", html, StringComparison.Ordinal);
    }

    [Fact]
    public void Render_TellsAScreenReaderWhichLinksOpenANewTab_InDutchToo()
    {
        string html = Dutch();

        Assert.Equal(
            Regex.Matches(html, "target=\"_blank\"").Count,
            Regex.Matches(html, "opent in een nieuw tabblad").Count);
    }

    [Fact]
    public void Render_LeavesNoFrenchWordOnTheDutchPage()
    {
        string html = Dutch();

        IEnumerable<string> french = FixedStrings(SiteCopy.French)
            .Zip(FixedStrings(SiteCopy.Dutch), (fr, nl) => (Fr: fr, Nl: nl))
            .Where(pair => pair.Fr != pair.Nl)
            .Select(pair => pair.Fr.Trim())
            .Where(fr => fr.Length > 3);
        foreach (string word in french)
        {
            Assert.DoesNotContain(word, html, StringComparison.Ordinal);
        }
    }

    [Fact]
    public void Render_LeavesNoDutchWordOnTheFrenchPage()
    {
        string html = Html();

        IEnumerable<string> dutch = FixedStrings(SiteCopy.Dutch)
            .Zip(FixedStrings(SiteCopy.French), (nl, fr) => (Nl: nl, Fr: fr))
            .Where(pair => pair.Fr != pair.Nl)
            .Select(pair => pair.Nl.Trim())
            .Where(nl => nl.Length > 3);
        foreach (string word in dutch)
        {
            Assert.DoesNotContain(word, html, StringComparison.Ordinal);
        }
    }

    [Fact]
    public void Render_KeepsTheStructuredDataInTheLanguageOfThePage()
    {
        string html = Dutch();

        Assert.Contains("\"name\":\"Menukaart van Brasserie de la Senne Dor", html, StringComparison.Ordinal);
        Assert.Contains("\"name\":\"Reserveer een tafel\"", html, StringComparison.Ordinal);
        Assert.DoesNotContain("Carte de", html, StringComparison.Ordinal);
    }

    // ── Same page, another language ──────────────────────────────────────────

    [Fact]
    public void In_WritesTheSamePageInTheOtherLanguage()
    {
        RenderedSitePage french = SitePageRenderer.Render(SiteSamples.Full());

        RenderedSitePage dutch = french.In("nl");

        Assert.Equal(SitePageRenderer.Render(SiteSamples.Full(m => m with { Language = "nl" })).Html, dutch.Html);
        Assert.Equal(french.Html, dutch.In("fr").Html);
    }

    [Fact]
    public void In_ReturnsThePageItself_WhenItIsAlreadyInThatLanguage_OrCarriesNoModel()
    {
        RenderedSitePage french = SitePageRenderer.Render(SiteSamples.Full());
        var withoutModel = new RenderedSitePage("<html></html>", "default-src 'none'");

        Assert.Same(french, french.In("fr"));
        Assert.Same(french, french.In("de"));
        Assert.Same(withoutModel, withoutModel.In("nl"));
    }

    [Fact]
    public void In_KeepsTheStylesheetPolicyOfThePageItReturns()
    {
        RenderedSitePage dutch = SitePageRenderer.Render(SiteSamples.Full()).In("nl");

        Match style = Regex.Match(dutch.Html, "<style>(.*?)</style>", RegexOptions.Singleline);
        Assert.Equal(SitePageRenderer.ContentSecurityPolicyFor(style.Groups[1].Value), dutch.ContentSecurityPolicy);
    }

    // ── The page nobody can see ──────────────────────────────────────────────

    [Fact]
    public void NotFoundPage_IsWrittenInTheRequestedLanguage_AndNamesNoSite()
    {
        string french = SitePageRenderer.NotFoundPage("fr");
        string dutch = SitePageRenderer.NotFoundPage("nl");

        Assert.Contains("<html lang=\"fr\">", french, StringComparison.Ordinal);
        Assert.Contains("<title>Page introuvable</title>", french, StringComparison.Ordinal);
        Assert.Contains("<p>Cette adresse ne correspond à aucun site.</p>", french, StringComparison.Ordinal);
        Assert.Contains("<html lang=\"nl\">", dutch, StringComparison.Ordinal);
        Assert.Contains("<title>Pagina niet gevonden</title>", dutch, StringComparison.Ordinal);
        Assert.Contains("<meta name=\"robots\" content=\"noindex\">", dutch, StringComparison.Ordinal);
        Assert.Equal(french, SitePageRenderer.NotFoundPage("de"));
        Assert.Equal(french, SitePageRenderer.NotFoundPage(null));
    }

    private static IEnumerable<string> FixedStrings(SiteCopy copy)
        => typeof(SiteCopy).GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(p => p.PropertyType == typeof(string))
            .Where(p => p.Name is not nameof(SiteCopy.Language) and not nameof(SiteCopy.OgLocale) and not nameof(SiteCopy.LanguageName)
                and not nameof(SiteCopy.DecimalSeparator) and not nameof(SiteCopy.GroupSeparator))
            .Select(p => (string)p.GetValue(copy)!)
            .Concat(copy.Days)
            .Concat(copy.AllergenTable.Select(a => a.Label))
            .Concat(copy.DietTable.Select(d => d.Label));
}
