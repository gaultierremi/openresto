using System.Buffers.Text;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Utilities;

public class PublicTokenGeneratorTests
{
    [Fact]
    public void New_IsBase64UrlOfSixteenBytes()
    {
        string token = PublicTokenGenerator.New();

        Assert.Matches("^[A-Za-z0-9_-]+$", token);
        Assert.Equal(PublicTokenGenerator.ByteLength, Base64Url.DecodeFromChars(token).Length);
        Assert.True(token.Length <= PublicTokenGenerator.MaxLength);
    }

    [Fact]
    public void New_NeverRepeatsAcrossManyDraws()
    {
        var tokens = Enumerable.Range(0, 10_000).Select(_ => PublicTokenGenerator.New()).ToList();
        Assert.Equal(tokens.Count, tokens.Distinct(StringComparer.Ordinal).Count());
    }

    [Fact]
    public void NewRestaurantsAndTables_EachGetTheirOwnToken()
    {
        Assert.NotEqual(new Restaurant().PublicToken, new Restaurant().PublicToken);
        Assert.NotEqual(new Table().PublicToken, new Table().PublicToken);
    }
}
