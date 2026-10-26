using System.Text.Json;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Domain;

public sealed class ServiceExceptionTests
{
    [Fact]
    public void SpecialService_OpensAUsuallyClosedDay_AndKeepsItsOvernightTail()
    {
        var restaurant = new Restaurant { OpenDays = "1", Timezone = "Europe/Brussels",
            ServiceExceptionsJson = JsonSerializer.Serialize(new[] { new ServiceException("2026-10-24", false, "18:00", "02:00") }) };
        Assert.True(ServiceWindowHelper.IsOpenOn(restaurant, new DateTime(2026, 10, 24)));
        Assert.True(restaurant.IsOpenAt(new DateTime(2026, 10, 24, 23, 30, 0, DateTimeKind.Utc)));
        Assert.False(restaurant.IsOpenAt(new DateTime(2026, 10, 24, 15, 59, 0, DateTimeKind.Utc)));
        Assert.False(restaurant.IsOpenAt(new DateTime(2026, 10, 25, 2, 0, 0, DateTimeKind.Utc)));
    }

    [Fact]
    public void Closure_BlocksItsService_ButPreservesThePreviousDaysOvernightTail()
    {
        var restaurant = new Restaurant { OpenTime = "18:00", CloseTime = "02:00",
            ServiceExceptionsJson = JsonSerializer.Serialize(new[] { new ServiceException("2026-10-24", true, "00:00", "00:00") }) };
        Assert.False(ServiceWindowHelper.IsOpenOn(restaurant, new DateTime(2026, 10, 24)));
        Assert.True(restaurant.IsOpenAt(new DateTime(2026, 10, 24, 1, 0, 0, DateTimeKind.Utc)));
        Assert.False(restaurant.IsOpenAt(new DateTime(2026, 10, 24, 18, 0, 0, DateTimeKind.Utc)));
        Assert.False(restaurant.IsOpenAt(new DateTime(2026, 10, 25, 1, 0, 0, DateTimeKind.Utc)));
    }
}
