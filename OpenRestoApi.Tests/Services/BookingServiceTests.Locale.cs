using Microsoft.EntityFrameworkCore;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Mappings;
using OpenRestoApi.Core.Application.Services;
using OpenRestoApi.Core.Domain;
using OpenRestoApi.Infrastructure.Persistence;

namespace OpenRestoApi.Tests.Services;

/// <summary>
/// The guest's language is kept on the booking so the confirmation mail can be written in it. It is
/// a hint, never a requirement: an unsupported value is dropped and the booking still goes through.
/// </summary>
public partial class BookingServiceTests
{
    private static async Task<string?> StoredLocaleAsync(AppDbContext db, BookingDto created)
        => (await db.Bookings.AsNoTracking().SingleAsync(b => b.BookingRef == created.BookingRef)).Locale;

    [Theory]
    [InlineData("nl", "nl")]
    [InlineData("fr", "fr")]
    [InlineData(" NL ", "nl")]
    [InlineData("es", "es")]
    public async Task CreateBookingAsync_KeepsTheGuestsLanguage(string sent, string stored)
    {
        using AppDbContext db = TestDbFactory.Create(nameof(CreateBookingAsync_KeepsTheGuestsLanguage) + Guid.NewGuid());
        TestSeed.BasicRestaurant(db);

        BookingDto created = await CreateService(db).CreateBookingAsync(new BookingDto
        {
            RestaurantId = 1, SectionId = 1, TableId = 1, CustomerEmail = "guest@example.com", Seats = 2,
            Date = DateTime.UtcNow.AddDays(7), Locale = sent,
        });

        Assert.Equal(stored, await StoredLocaleAsync(db, created));
        Assert.Equal(stored, created.Locale);
    }

    [Theory]
    [InlineData("pt")]
    [InlineData("nl-BE")]
    [InlineData("<script>alert(1)</script>")]
    [InlineData("a-locale-far-longer-than-eight-characters")]
    [InlineData("  ")]
    [InlineData("")]
    [InlineData(null)]
    public async Task CreateBookingAsync_IgnoresAnUnsupportedLanguage_AndStillBooks(string? sent)
    {
        using AppDbContext db = TestDbFactory.Create(nameof(CreateBookingAsync_IgnoresAnUnsupportedLanguage_AndStillBooks) + Guid.NewGuid());
        TestSeed.BasicRestaurant(db);

        BookingDto created = await CreateService(db).CreateBookingAsync(new BookingDto
        {
            RestaurantId = 1, SectionId = 1, TableId = 1, CustomerEmail = "guest@example.com", Seats = 2,
            Date = DateTime.UtcNow.AddDays(7), Locale = sent,
        });

        Assert.NotNull(created.BookingRef);
        Assert.Null(await StoredLocaleAsync(db, created));
        Assert.Null(created.Locale);
    }

    [Fact]
    public async Task CreateBookingAsync_KeepsTheGuestsLanguage_WhenTheTableIsAutoAssigned()
    {
        using AppDbContext db = TestDbFactory.Create(nameof(CreateBookingAsync_KeepsTheGuestsLanguage_WhenTheTableIsAutoAssigned));
        SeedMultiTableRestaurant(db);

        BookingDto created = await CreateService(db).CreateBookingAsync(new BookingDto
        {
            RestaurantId = 1, CustomerEmail = "auto@example.com", Seats = 2, Date = DateTime.UtcNow.AddDays(9), Locale = "nl",
        });

        Assert.NotNull(created.TableId);
        Assert.Equal("nl", await StoredLocaleAsync(db, created));
    }

    [Fact]
    public async Task CreateBookingAsync_KeepsTheGuestsLanguage_ForACombinedTableGroup()
    {
        using AppDbContext db = TestDbFactory.Create(nameof(CreateBookingAsync_KeepsTheGuestsLanguage_ForACombinedTableGroup));
        SeedRestaurantWithGroup(db);

        BookingDto created = await CreateService(db).CreateBookingAsync(new BookingDto
        {
            RestaurantId = 1, CustomerEmail = "group@example.com", Seats = 6, Date = DateTime.UtcNow.AddDays(11),
            TableGroupId = 1, Locale = "nl",
        });

        Assert.Equal(1, created.TableGroupId);
        Assert.Equal("nl", await StoredLocaleAsync(db, created));
    }

    [Fact]
    public async Task CreateBookingAsync_DropsAnUnsupportedLanguage_ForACombinedTableGroupToo()
    {
        using AppDbContext db = TestDbFactory.Create(nameof(CreateBookingAsync_DropsAnUnsupportedLanguage_ForACombinedTableGroupToo));
        SeedRestaurantWithGroup(db);

        BookingDto created = await CreateService(db).CreateBookingAsync(new BookingDto
        {
            RestaurantId = 1, CustomerEmail = "group@example.com", Seats = 6, Date = DateTime.UtcNow.AddDays(11),
            TableGroupId = 1, Locale = "xx",
        });

        Assert.Null(await StoredLocaleAsync(db, created));
    }

    [Fact]
    public void TheMapper_NeverCopiesALanguageOntoAnEntity_ButReportsTheStoredOne()
    {
        var mapper = new BookingMapper();

        Booking entity = mapper.ToEntity(new BookingDto { RestaurantId = 1, Locale = "nl" });
        BookingDto dto = mapper.ToDto(new Booking { RestaurantId = 1, Locale = "nl" });

        Assert.Null(entity.Locale);
        Assert.Equal("nl", dto.Locale);
    }
}
