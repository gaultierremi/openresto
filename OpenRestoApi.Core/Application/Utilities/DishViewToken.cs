using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace OpenRestoApi.Core.Application.Utilities;

public static class DishViewToken
{
    public static string For(string restaurantToken, int itemId)
        => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(restaurantToken + ":dish:" + itemId.ToString(CultureInfo.InvariantCulture))));
}
