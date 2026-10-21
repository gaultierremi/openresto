using System.Security.Cryptography;
using System.Text;

namespace OpenRestoApi.Core.Domain;

/// <summary>
/// Mints and hashes invitation tokens. The token is 256 bits from the system's CSPRNG, so a fast
/// hash is enough to store it (the same reasoning as <c>ApiKeyCrypto</c>): there is nothing to
/// brute-force.
/// </summary>
public static class InvitationToken
{
    public const int ByteLength = 32;

    public static string New() => Base64Url(RandomNumberGenerator.GetBytes(ByteLength));

    public static string Hash(string token)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    private static string Base64Url(byte[] bytes)
        => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
