using OpenRestoApi.Core.Application.Services;

namespace OpenRestoApi.Tests.Services;

public class InvitationMailTests
{
    private static readonly DateTime Expires = new(2027, 3, 3, 10, 0, 0, DateTimeKind.Utc);

    private static (string Subject, string Html) Build(
        string? locale,
        string restaurantName = "Chez Léa",
        string primaryColor = "#112233",
        string invitationUrl = "https://app.example/invitation/abc")
        => InvitationMail.Build(locale, restaurantName, "OpenResto", primaryColor, "https://app.example", invitationUrl, Expires);

    // ── Language ─────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("fr", "Invitation : créez l’espace de Chez Léa", "Vous êtes invité(e)", "Créer mon espace", "3 mars 2027")]
    [InlineData("nl", "Uitnodiging: maak de ruimte van Chez Léa aan", "U bent uitgenodigd", "Mijn ruimte aanmaken", "3 maart 2027")]
    [InlineData("en", "Invitation: set up the space for Chez Léa", "You are invited", "Create my space", "3 March 2027")]
    public void Build_SpeaksTheRequestedLanguage_AndFallsBackToFrench(
        string locale, string subject, string bodyWord, string button, string date)
    {
        (string actualSubject, string html) = Build(locale);

        Assert.Equal(subject, actualSubject);
        Assert.Contains(bodyWord, html);
        Assert.Contains(button, html);
        Assert.Contains(date, html);
    }

    [Theory]
    [InlineData("de")]
    [InlineData("es")]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("klingon")]
    [InlineData("fr-BE")]
    public void Build_FallsBackToFrench_ForAnyOtherLocale(string? locale)
    {
        (string subject, string html) = Build(locale);

        Assert.Equal(Build("fr").Subject, subject);
        Assert.Contains("Vous êtes invité(e)", html);
        Assert.Contains("3 mars 2027", html);
        Assert.DoesNotContain("You are invited", html);
        Assert.DoesNotContain("U bent uitgenodigd", html);
    }

    [Theory]
    [InlineData("NL")]
    [InlineData("Nl")]
    [InlineData("  nl  ")]
    public void Build_ReadsTheLocaleCaseInsensitively(string locale)
    {
        (string subject, string html) = Build(locale);

        Assert.Equal(Build("nl").Subject, subject);
        Assert.Contains("3 maart 2027", html);
    }

    [Theory]
    [InlineData(1, "janvier", "januari", "January")]
    [InlineData(2, "février", "februari", "February")]
    [InlineData(8, "août", "augustus", "August")]
    [InlineData(12, "décembre", "december", "December")]
    public void Build_WritesTheMonthFromItsOwnTable_NotFromCultureData(int month, string fr, string nl, string en)
    {
        var date = new DateTime(2027, month, 1, 0, 0, 0, DateTimeKind.Utc);

        string Html(string locale) => InvitationMail.Build(locale, "R", "App", "#112233", "https://a.example", "https://a.example/i", date).Html;

        Assert.Contains($"1 {fr} 2027", Html("fr"));
        Assert.Contains($"1 {nl} 2027", Html("nl"));
        Assert.Contains($"1 {en} 2027", Html("en"));
    }

    // ── Resolve ──────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("fr", "fr")]
    [InlineData("nl", "nl")]
    [InlineData("en", "en")]
    [InlineData("NL", "nl")]
    [InlineData(" En ", "en")]
    [InlineData("de", "fr")]
    [InlineData("", "fr")]
    [InlineData(null, "fr")]
    public void Resolve_NamesTheLanguageTheMailWillBeWrittenIn(string? locale, string expected)
        => Assert.Equal(expected, InvitationMail.Resolve(locale));

    // ── Escaping ─────────────────────────────────────────────────────────────

    [Fact]
    public void Build_EscapesTheRestaurantName()
    {
        (_, string html) = Build("en", restaurantName: "Chez <script>alert(1)</script> & Fils");

        Assert.DoesNotContain("<script>", html);
        Assert.Contains("Chez &lt;script&gt;alert(1)&lt;/script&gt; &amp; Fils", html);
    }

    [Fact]
    public void Build_EscapesTheInvitationLinkForTheHrefAttribute()
    {
        (_, string html) = Build("en", invitationUrl: "https://app.example/i?a=1&b=\"2\"");

        Assert.Contains("href=\"https://app.example/i?a=1&amp;b=&quot;2&quot;\"", html);
        Assert.DoesNotContain("b=\"2\"", html);
    }

    [Fact]
    public void Build_LeavesTheSubjectAsPlainText()
        => Assert.Equal("Invitation: set up the space for Chez & Fils", Build("en", restaurantName: "Chez & Fils").Subject);

    // ── Colour ───────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("#112233")]
    [InlineData("#AbCdEf")]
    public void Build_KeepsAnRrggbbColour(string color)
        => Assert.Contains($"background-color:{color};color:#ffffff", Build("en", primaryColor: color).Html);

    [Theory]
    [InlineData("red")]
    [InlineData("#fff")]
    [InlineData("#112233ff")]
    [InlineData("#11223g")]
    [InlineData("")]
    [InlineData("#112233;background:url(x)")]
    [InlineData("\" onmouseover=\"x")]
    public void Build_FallsBackToTheDefaultColour_WhenItIsNotAnRrggbb(string color)
    {
        string html = Build("en", primaryColor: color).Html;

        Assert.Contains("background-color:#0a7ea4;color:#ffffff", html);
        Assert.DoesNotContain("onmouseover", html);
        Assert.DoesNotContain("url(x)", html);
    }
}
