using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Utilities;

public class SiteFieldsTests
{
    private static string Repeat(int length) => new('x', length);

    private static SiteSocialLinkDto Link(string kind, string url) => new() { Kind = kind, Url = url };

    // ── Tagline ──────────────────────────────────────────────────────────────

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void NormalizeTagline_ClearsABlank(string? value)
        => Assert.Null(SiteFields.NormalizeTagline(value));

    [Fact]
    public void NormalizeTagline_AcceptsTheCap_AndTrims()
        => Assert.Equal(Repeat(SiteFields.MaxTaglineLength), SiteFields.NormalizeTagline($"  {Repeat(SiteFields.MaxTaglineLength)}  "));

    [Fact]
    public void NormalizeTagline_RefusesOneOverTheCap()
    {
        ValidationException ex = Assert.Throws<ValidationException>(
            () => SiteFields.NormalizeTagline(Repeat(SiteFields.MaxTaglineLength + 1)));

        Assert.Equal(ErrorCodes.SiteTaglineTooLong, ex.Code);
    }

    // ── Photo description ────────────────────────────────────────────────────

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("  ")]
    public void NormalizeAlt_RefusesABlank(string? value)
        => Assert.Equal(ErrorCodes.SitePhotoAltRequired, Assert.Throws<ValidationException>(() => SiteFields.NormalizeAlt(value)).Code);

    [Fact]
    public void NormalizeAlt_AcceptsTheCap()
        => Assert.Equal(SiteFields.MaxAltLength, SiteFields.NormalizeAlt(Repeat(SiteFields.MaxAltLength)).Length);

    [Fact]
    public void NormalizeAlt_RefusesOneOverTheCap()
        => Assert.Equal(ErrorCodes.SitePhotoAltTooLong,
            Assert.Throws<ValidationException>(() => SiteFields.NormalizeAlt(Repeat(SiteFields.MaxAltLength + 1))).Code);

    // ── Theme ────────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("Brasserie", SiteTheme.Brasserie)]
    [InlineData("Gastronomique", SiteTheme.Gastronomique)]
    [InlineData("Cafe", SiteTheme.Cafe)]
    public void ParseTheme_ReadsEachName(string name, SiteTheme expected)
        => Assert.Equal(expected, SiteFields.ParseTheme(name));

    [Theory]
    [InlineData("brasserie")]
    [InlineData("0")]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("Neon")]
    public void ParseTheme_RefusesAnythingElse_NumbersIncluded(string? name)
        => Assert.Equal(ErrorCodes.SiteThemeInvalid, Assert.Throws<ValidationException>(() => SiteFields.ParseTheme(name)).Code);

    // ── Legal identifiers ────────────────────────────────────────────────────

    [Theory]
    [InlineData("0123.456.789")]
    [InlineData("BE 0123 456 789")]
    [InlineData("BE0123456789")]
    [InlineData("IE-6388047/V")]
    public void NormalizeIdentifier_KeepsTheSeparatorsPeopleType(string value)
        => Assert.Equal(value, SiteFields.NormalizeIdentifier(value, 20, "Company number"));

    [Theory]
    [InlineData("0123<script>")]
    [InlineData("0123_456")]
    [InlineData("0123;456")]
    [InlineData("Ü123")]
    public void NormalizeIdentifier_RefusesAnythingElse(string value)
        => Assert.Equal(ErrorCodes.SiteLegalInvalid,
            Assert.Throws<ValidationException>(() => SiteFields.NormalizeIdentifier(value, 20, "Company number")).Code);

    [Fact]
    public void NormalizeIdentifier_AcceptsTheCap_AndRefusesOneOver()
    {
        Assert.NotNull(SiteFields.NormalizeIdentifier(new string('1', 20), 20, "VAT number"));
        Assert.Equal(ErrorCodes.SiteLegalTooLong,
            Assert.Throws<ValidationException>(() => SiteFields.NormalizeIdentifier(new string('1', 21), 20, "VAT number")).Code);
    }

    [Fact]
    public void NormalizeIdentifier_ClearsABlank()
        => Assert.Null(SiteFields.NormalizeIdentifier("  ", 20, "VAT number"));

    [Fact]
    public void LegalNameAndAddress_HaveTheirOwnCaps()
    {
        Assert.Equal(SiteFields.MaxLegalNameLength, SiteFields.NormalizeLegalName(Repeat(SiteFields.MaxLegalNameLength))!.Length);
        Assert.Equal(ErrorCodes.SiteLegalTooLong,
            Assert.Throws<ValidationException>(() => SiteFields.NormalizeLegalName(Repeat(SiteFields.MaxLegalNameLength + 1))).Code);

        Assert.Equal(SiteFields.MaxLegalAddressLength, SiteFields.NormalizeLegalAddress(Repeat(SiteFields.MaxLegalAddressLength))!.Length);
        Assert.Equal(ErrorCodes.SiteLegalTooLong,
            Assert.Throws<ValidationException>(() => SiteFields.NormalizeLegalAddress(Repeat(SiteFields.MaxLegalAddressLength + 1))).Code);
    }

    // ── Social links ─────────────────────────────────────────────────────────

    [Fact]
    public void NormalizeSocialLinks_OrdersByNetworkAndCanonicalisesTheName()
    {
        List<SiteSocialLink> links = SiteFields.NormalizeSocialLinks(
        [
            Link("tripadvisor", "https://tripadvisor.be/x"),
            Link(" INSTAGRAM ", "https://instagram.com/x"),
            Link("Facebook", "https://facebook.com/x"),
        ]);

        Assert.Equal(["Facebook", "Instagram", "TripAdvisor"], links.Select(l => l.Kind));
    }

    [Fact]
    public void NormalizeSocialLinks_TreatsNullAsNone()
        => Assert.Empty(SiteFields.NormalizeSocialLinks(null));

    [Theory]
    [InlineData("http://instagram.com/x")]
    [InlineData("javascript:alert(1)")]
    [InlineData("mailto:a@b.be")]
    [InlineData("//instagram.com/x")]
    [InlineData("instagram.com/x")]
    [InlineData("")]
    public void NormalizeSocialLinks_RefusesAnythingButAnHttpsAddress(string url)
        => Assert.Equal(ErrorCodes.SiteSocialInvalid,
            Assert.Throws<ValidationException>(() => SiteFields.NormalizeSocialLinks([Link("Instagram", url)])).Code);

    [Fact]
    public void NormalizeSocialLinks_RefusesAnUnknownNetwork()
        => Assert.Equal(ErrorCodes.SiteSocialInvalid,
            Assert.Throws<ValidationException>(() => SiteFields.NormalizeSocialLinks([Link("MySpace", "https://myspace.com/x")])).Code);

    [Fact]
    public void NormalizeSocialLinks_RefusesTwoLinksToTheSameNetwork()
        => Assert.Equal(ErrorCodes.SiteSocialInvalid,
            Assert.Throws<ValidationException>(() => SiteFields.NormalizeSocialLinks(
                [Link("Instagram", "https://instagram.com/a"), Link("instagram", "https://instagram.com/b")])).Code);

    [Fact]
    public void NormalizeSocialLinks_AcceptsAnAddressAtTheCap_AndRefusesOneOver()
    {
        string atCap = "https://instagram.com/" + new string('a', SiteFields.MaxUrlLength - "https://instagram.com/".Length);

        Assert.Single(SiteFields.NormalizeSocialLinks([Link("Instagram", atCap)]));
        Assert.Equal(ErrorCodes.SiteSocialInvalid,
            Assert.Throws<ValidationException>(() => SiteFields.NormalizeSocialLinks([Link("Instagram", atCap + "a")])).Code);
    }

    [Fact]
    public void NormalizeSocialLinks_AcceptsOneLinkPerNetwork()
    {
        IEnumerable<SiteSocialLinkDto> all = SiteContent.SocialKinds.Select(k => Link(k, $"https://example.com/{k}"));

        Assert.Equal(SiteContent.SocialKinds.Count, SiteFields.NormalizeSocialLinks(all).Count);
    }

    // ── Publication readiness ────────────────────────────────────────────────

    [Fact]
    public void MissingForPublication_NamesEachGap()
    {
        Assert.Equal(
            [SiteFields.MissingLegalName, SiteFields.MissingCompanyNumber, SiteFields.MissingContactEmail],
            SiteFields.MissingForPublication(new RestaurantSite(), contactEmail: null));
    }

    [Fact]
    public void MissingForPublication_IsEmptyOnceTheIdentityAndTheContactAreThere()
        => Assert.Empty(SiteFields.MissingForPublication(
            new RestaurantSite { LegalName = "Senne Dorée SRL", CompanyNumber = "0123.456.789" }, "bonjour@senne.example"));

    [Fact]
    public void MissingForPublication_AsksForAPublicAddress_OnlyWhenTheInstanceHasNone()
    {
        var site = new RestaurantSite { LegalName = "Senne Dorée SRL", CompanyNumber = "0123.456.789" };

        Assert.Equal([SiteFields.MissingPublicUrl], SiteFields.MissingForPublication(site, "a@b.be", publicUrlConfigured: false));
        Assert.Empty(SiteFields.MissingForPublication(site, "a@b.be", publicUrlConfigured: true));
    }

    [Theory]
    [InlineData(" ")]
    [InlineData("")]
    public void MissingForPublication_TreatsABlankAsMissing(string blank)
        => Assert.Equal(
            [SiteFields.MissingLegalName, SiteFields.MissingCompanyNumber, SiteFields.MissingContactEmail],
            SiteFields.MissingForPublication(new RestaurantSite { LegalName = blank, CompanyNumber = blank }, blank));
}
