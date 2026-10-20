using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Domain;

public class SiteContentTests
{
    [Fact]
    public void Photos_SurviveAWriteAndARead()
    {
        List<SitePhoto> photos = [new("a", "/media/a.jpg", "La salle", 1200, 800), new("b", "/media/b.jpg", "Le bar", 900, 900)];

        List<SitePhoto> read = SiteContent.ReadPhotos(SiteContent.Write(photos));

        Assert.Equal(photos, read);
    }

    [Fact]
    public void SocialLinks_SurviveAWriteAndARead()
    {
        List<SiteSocialLink> links = [new("Instagram", "https://instagram.com/x")];

        Assert.Equal(links, SiteContent.ReadSocialLinks(SiteContent.Write(links)));
    }

    [Fact]
    public void AnEmptyList_IsStoredAsNull()
    {
        Assert.Null(SiteContent.Write(new List<SitePhoto>()));
        Assert.Null(SiteContent.Write(new List<SiteSocialLink>()));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("not json")]
    [InlineData("{\"a\":1}")]
    [InlineData("[{\"id\":")]
    public void AColumnThatDoesNotParse_ReadsAsEmpty_SoThePageStillOpens(string? json)
    {
        Assert.Empty(SiteContent.ReadPhotos(json));
        Assert.Empty(SiteContent.ReadSocialLinks(json));
    }

    [Fact]
    public void ANullEntryInTheArray_IsDropped()
        => Assert.Empty(SiteContent.ReadSocialLinks("[null]"));
}
