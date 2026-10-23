using System.Globalization;
using System.Text.Json;

namespace OpenRestoApi.Core.Domain;

public sealed record ServiceException(string Date, bool Closed, string Open, string Close)
{
    public static List<ServiceException> Read(Restaurant restaurant)
        => string.IsNullOrEmpty(restaurant.ServiceExceptionsJson)
            ? [] : JsonSerializer.Deserialize<List<ServiceException>>(restaurant.ServiceExceptionsJson) ?? [];

    public static ServiceException? On(Restaurant restaurant, DateTime localDate)
        => Read(restaurant).FirstOrDefault(e => e.Date == localDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture));
}
