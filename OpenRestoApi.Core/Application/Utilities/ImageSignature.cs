namespace OpenRestoApi.Core.Application.Utilities;

/// <summary>
/// Checks an upload's leading bytes against the type it declares. A <c>Content-Type</c> is
/// whatever the client writes, so on its own it lets a script or an HTML page be stored under an
/// image name and served from <c>/media/</c>; the magic bytes are what the file actually is.
/// </summary>
/// <seealso>ImageSignatureTests.Matches_AcceptsEachTypeWithItsOwnSignature</seealso>
/// <seealso>ImageSignatureTests.Matches_RefusesASignatureOfAnotherTypeOrNone</seealso>
public static class ImageSignature
{
    /// <summary>Enough bytes to tell the three types apart: WebP's marker ends at byte 12.</summary>
    public const int HeaderLength = 12;

    private static readonly byte[] _jpeg = [0xFF, 0xD8, 0xFF];
    private static readonly byte[] _png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    /// <summary>Reads the leading bytes of <paramref name="stream"/> and rewinds it, so what is stored is the file that was checked.</summary>
    public static async Task<bool> MatchesAsync(Stream stream, string contentType)
    {
        byte[] header = new byte[HeaderLength];
        int read = await stream.ReadAtLeastAsync(header, header.Length, throwOnEndOfStream: false);
        stream.Position = 0;
        return Matches(header.AsSpan(0, read), contentType);
    }

    public static bool Matches(ReadOnlySpan<byte> header, string contentType) => contentType switch
    {
        "image/jpeg" => header.StartsWith(_jpeg),
        "image/png" => header.StartsWith(_png),
        "image/webp" => header.Length >= HeaderLength
            && header[..4].SequenceEqual("RIFF"u8)
            && header[8..12].SequenceEqual("WEBP"u8),
        _ => false,
    };
}
