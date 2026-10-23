using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Launch;

namespace OpenRestoApi.Tests.Core;

public class GuestBookingTimesTests
{
    [Fact]
    public void OnlyAvailableFutureSlotsAreOffered_AtTheRestaurantsLocalTime()
    {
        var day = new DateTime(2026, 10, 22);
        var response = new AvailabilityResponseDto
        {
            Slots =
        [
            new() { Time = "09:00", IsAvailable = true },
            new() { Time = "10:00", IsAvailable = true },
            new() { Time = "11:00", IsAvailable = false },
            new() { Time = "12:00", IsAvailable = true },
        ]
        };
        List<GuestSlot> slots = GuestBookingTimes.Slots(response, day, "Europe/Brussels", new DateTime(2026, 10, 22, 8, 0, 0, DateTimeKind.Utc));
        GuestSlot slot = Assert.Single(slots);
        Assert.Equal("12:00", slot.Label);
        Assert.Equal("2026-10-22T10:00:00.0000000Z", slot.Value);
    }

    [Fact]
    public void AnOvernightServiceOffersTheAfterMidnightSlotOnTheFollowingDate()
    {
        var response = new AvailabilityResponseDto
        {
            Slots =
        [
            new() { Time = "23:30", IsAvailable = true },
            new() { Time = "00:30", IsAvailable = true },
        ]
        };
        List<GuestSlot> slots = GuestBookingTimes.Slots(response, new DateTime(2026, 10, 22), "Europe/Brussels", DateTime.UnixEpoch);
        Assert.Equal("2026-10-22T21:30:00.0000000Z", slots[0].Value);
        Assert.Equal("2026-10-22T22:30:00.0000000Z", slots[1].Value);
        Assert.Equal("00:30 (le lendemain)", slots[1].Label);
    }

    [Fact]
    public void TheSpringClockChangeDoesNotOfferANonexistentLocalTime()
    {
        var response = new AvailabilityResponseDto
        {
            Slots =
        [
            new() { Time = "02:30", IsAvailable = true },
            new() { Time = "03:30", IsAvailable = true },
        ]
        };
        GuestSlot slot = Assert.Single(GuestBookingTimes.Slots(response, new DateTime(2027, 3, 28), "Europe/Brussels", DateTime.UnixEpoch));
        Assert.Equal("03:30", slot.Label);
        Assert.Equal("2027-03-28T01:30:00.0000000Z", slot.Value);
    }
}
