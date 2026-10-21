using OpenRestoApi.Core.Application.Utilities;

namespace OpenRestoApi.Tests.Utilities;

public class ImageSignatureTests
{
    private static readonly byte[] _jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 0, 0, 0, 0, 0, 0];
    private static readonly byte[] _png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];
    private static readonly byte[] _webp = [.. "RIFF"u8, 0x24, 0, 0, 0, .. "WEBP"u8];

    [Fact]
    public void Matches_AcceptsEachTypeWithItsOwnSignature()
    {
        Assert.True(ImageSignature.Matches(_jpeg, "image/jpeg"));
        Assert.True(ImageSignature.Matches(_png, "image/png"));
        Assert.True(ImageSignature.Matches(_webp, "image/webp"));
    }

    [Fact]
    public void Matches_RefusesASignatureOfAnotherTypeOrNone()
    {
        Assert.False(ImageSignature.Matches(_png, "image/jpeg"));
        Assert.False(ImageSignature.Matches(_jpeg, "image/png"));
        Assert.False(ImageSignature.Matches(_png, "image/webp"));
        Assert.False(ImageSignature.Matches("<html><script>"u8, "image/png"));
        Assert.False(ImageSignature.Matches([], "image/jpeg"));
        Assert.False(ImageSignature.Matches(_jpeg, "image/gif"));
    }

    [Fact]
    public void Matches_RefusesARiffContainerThatIsNotWebp_AndATruncatedOne()
    {
        byte[] wave = [.. "RIFF"u8, 0x24, 0, 0, 0, .. "WAVE"u8];

        Assert.False(ImageSignature.Matches(wave, "image/webp"));
        Assert.False(ImageSignature.Matches(_webp.AsSpan(0, 11), "image/webp"));
    }

    [Fact]
    public void Matches_ReadsOnlyTheLeadingBytes_SoATruncatedPngSignatureFails()
    {
        Assert.False(ImageSignature.Matches(_png.AsSpan(0, 7), "image/png"));
    }
}
