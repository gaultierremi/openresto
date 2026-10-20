using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Domain;

public class InvitationTokenTests
{
    [Fact]
    public void New_IsUrlSafe()
    {
        for (int i = 0; i < 200; i++)
        {
            string token = InvitationToken.New();

            Assert.DoesNotContain('+', token);
            Assert.DoesNotContain('/', token);
            Assert.DoesNotContain('=', token);
            Assert.Matches("^[A-Za-z0-9_-]+$", token);
        }
    }

    [Fact]
    public void New_Is43CharactersForTheThirtyTwoBytes()
    {
        Assert.Equal(32, InvitationToken.ByteLength);
        Assert.Equal(43, InvitationToken.New().Length);
    }

    [Fact]
    public void New_NeverRepeats()
        => Assert.Equal(1000, Enumerable.Range(0, 1000).Select(_ => InvitationToken.New()).Distinct().Count());

    [Fact]
    public void Hash_IsDeterministic()
        => Assert.Equal(InvitationToken.Hash("abc"), InvitationToken.Hash("abc"));

    [Fact]
    public void Hash_IsKnownSha256InLowerCaseHex()
        => Assert.Equal("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", InvitationToken.Hash("abc"));

    [Fact]
    public void Hash_IsSixtyFourLowerCaseHexCharacters()
    {
        string hash = InvitationToken.Hash(InvitationToken.New());

        Assert.Equal(64, hash.Length);
        Assert.Matches("^[0-9a-f]{64}$", hash);
    }

    [Fact]
    public void Hash_DiffersForDifferentTokens()
        => Assert.NotEqual(InvitationToken.Hash("abc"), InvitationToken.Hash("abd"));

    [Fact]
    public void Hash_NeverEqualsTheToken()
    {
        string token = InvitationToken.New();

        Assert.NotEqual(token, InvitationToken.Hash(token));
    }
}
