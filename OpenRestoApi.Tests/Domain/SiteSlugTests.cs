using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Domain;

public class SiteSlugTests
{
    [Theory]
    [InlineData("Brasserie de la Senne Dorée", "brasserie-de-la-senne-doree")]
    [InlineData("  Chez   Œdipe & Fils  ", "chez-oedipe-fils")]
    [InlineData("Café « Straße »", "cafe-strasse")]
    [InlineData("L'Écailler du Palais Royal", "l-ecailler-du-palais-royal")]
    [InlineData("Pub 42", "pub-42")]
    public void From_StripsAccentsAndHyphenates(string name, string expected)
        => Assert.Equal(expected, SiteSlug.From(name));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("---")]
    [InlineData("日本語")]
    public void From_FallsBackWhenTheNameHasNoLetterOrDigit(string? name)
        => Assert.Equal(SiteSlug.Fallback, SiteSlug.From(name));

    [Fact]
    public void From_PadsAShortNameUpToTheMinimumLength()
    {
        string slug = SiteSlug.From("Ab");

        Assert.Equal(SiteSlug.MinLength, slug.Length);
        Assert.True(SiteSlug.IsValid(slug));
    }

    [Fact]
    public void From_CutsALongNameAtTheMaximum_WithoutALoneTrailingHyphen()
    {
        string slug = SiteSlug.From(string.Join(' ', Enumerable.Repeat("brasserie", 12)));

        Assert.True(slug.Length <= SiteSlug.MaxLength);
        Assert.True(SiteSlug.IsValid(slug));
    }

    [Fact]
    public void IsValid_AcceptsTheShortestAndLongestSlug()
    {
        Assert.True(SiteSlug.IsValid(new string('a', SiteSlug.MinLength)));
        Assert.True(SiteSlug.IsValid(new string('a', SiteSlug.MaxLength)));
    }

    [Fact]
    public void IsValid_RefusesOneCharacterTooShortOrTooLong()
    {
        Assert.False(SiteSlug.IsValid(new string('a', SiteSlug.MinLength - 1)));
        Assert.False(SiteSlug.IsValid(new string('a', SiteSlug.MaxLength + 1)));
    }

    [Theory]
    [InlineData("-abc")]
    [InlineData("abc-")]
    [InlineData("ab--cd")]
    [InlineData("Abc")]
    [InlineData("ab_cd")]
    [InlineData("ab cd")]
    [InlineData("é-ab")]
    [InlineData("a/b")]
    [InlineData(null)]
    public void IsValid_RefusesAnythingThatIsNotLowerCaseWordsJoinedBySingleHyphens(string? slug)
        => Assert.False(SiteSlug.IsValid(slug));

    [Theory]
    [InlineData("brasserie-de-la-senne-doree")]
    [InlineData("a1b")]
    [InlineData("42")]
    public void IsValid_AcceptsWordsAndDigits(string slug)
        => Assert.Equal(slug.Length >= SiteSlug.MinLength, SiteSlug.IsValid(slug));
}
