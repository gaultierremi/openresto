using System.Buffers.Text;
using System.Security.Cryptography;

namespace OpenRestoApi.Core.Domain;

/// <summary>
/// Mints the opaque identifier a printed QR code carries for a restaurant or a table. It is the
/// only thing the public menu endpoints accept, so internal ids never leave the API, and it comes
/// from a CSPRNG because a guessable token would let anyone walk every location's tables. It is
/// minted once and kept: changing it means reprinting the QR codes, which is why only an Owner's
/// explicit regenerate does.
/// </summary>
/// <seealso>PublicTokenGeneratorTests.New_IsBase64UrlOfSixteenBytes</seealso>
/// <seealso>PublicTokenGeneratorTests.New_NeverRepeatsAcrossManyDraws</seealso>
public static class PublicTokenGenerator
{
    public const int ByteLength = 16;

    /// <summary>The column cap. Base64url of <see cref="ByteLength"/> bytes is 22 characters.</summary>
    public const int MaxLength = 32;

    public static string New()
    {
        Span<byte> bytes = stackalloc byte[ByteLength];
        RandomNumberGenerator.Fill(bytes);
        return Base64Url.EncodeToString(bytes);
    }
}
