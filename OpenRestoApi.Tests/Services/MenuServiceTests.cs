using Microsoft.EntityFrameworkCore;
using Moq;
using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Services;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;
using OpenRestoApi.Infrastructure.Persistence;
using OpenRestoApi.Infrastructure.Persistence.Repositories;
using OpenRestoApi.Tests.Holds;

namespace OpenRestoApi.Tests.Services;

public class MenuServiceTests : IDisposable
{
    private const int RestaurantA = 1;
    private const int RestaurantB = 2;
    private static readonly DateTime Now = new(2026, 10, 19, 12, 0, 0, DateTimeKind.Utc);

    private readonly AppDbContext _db;
    private readonly Mock<IMediaStore> _store = new();
    private readonly AuditScope _audit = new();
    private readonly MenuService _svc;

    public MenuServiceTests()
    {
        _db = TestDbFactory.Create(Guid.NewGuid().ToString());
        _db.Restaurants.AddRange(
            new Restaurant { Id = RestaurantA, Name = "Alpha", Timezone = "Europe/Paris", PublicToken = "token-alpha" },
            new Restaurant { Id = RestaurantB, Name = "Beta", PublicToken = "token-beta" });
        _db.Sections.AddRange(
            new Section { Id = 1, Name = "Terrace", RestaurantId = RestaurantA },
            new Section { Id = 2, Name = "Hall", RestaurantId = RestaurantB });
        _db.Tables.AddRange(
            new Table { Id = 1, Name = "T1", Seats = 2, SectionId = 1, PublicToken = "table-alpha-1" },
            new Table { Id = 2, Name = "T2", Seats = 2, SectionId = 2, PublicToken = "table-beta-2" });
        _db.SaveChanges();

        _store.Setup(s => s.ReplaceAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Stream>()))
            .ReturnsAsync((string slot, string ext, Stream _) => $"{slot}.{ext}");
        var media = new MediaService(Mock.Of<IBrandSettingsRepository>(), Mock.Of<IRestaurantRepository>(), _store.Object);
        _svc = new MenuService(new MenuRepository(_db), media, new FakeClock(Now), _audit);
    }

    public void Dispose()
    {
        _db.Dispose();
        GC.SuppressFinalize(this);
    }

    private async Task<MenuDto> CreateMenuAsync(int restaurantId = RestaurantA, string name = "Lunch")
        => await _svc.CreateMenuAsync(restaurantId, new SaveMenuRequest { Name = name });

    private async Task<MenuCategoryDto> CreateCategoryAsync(int menuId, string name = "Mains", bool visible = true, int restaurantId = RestaurantA)
        => await _svc.CreateCategoryAsync(restaurantId, menuId, new SaveMenuCategoryRequest { Name = name, IsVisible = visible });

    private async Task<MenuItemDto> CreateItemAsync(int categoryId, string name = "Soup", string? availability = null, long? price = 900, int restaurantId = RestaurantA)
        => await _svc.CreateItemAsync(restaurantId, categoryId, new SaveMenuItemRequest { Name = name, PriceMinor = price, Availability = availability });

    private static string Repeat(int length) => new('x', length);

    // ── Menu validation ──────────────────────────────────────────────────────

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task CreateMenu_RejectsAnEmptyName_AndWritesNothing(string? name)
    {
        ValidationException ex = await Assert.ThrowsAsync<ValidationException>(
            () => _svc.CreateMenuAsync(RestaurantA, new SaveMenuRequest { Name = name }));

        Assert.Equal(ErrorCodes.MenuNameRequired, ex.Code);
        Assert.Empty(_db.Menus);
    }

    [Fact]
    public async Task CreateMenu_AcceptsANameAtTheCap()
    {
        MenuDto menu = await CreateMenuAsync(name: Repeat(MenuFields.MaxNameLength));
        Assert.Equal(MenuFields.MaxNameLength, menu.Name.Length);
    }

    [Fact]
    public async Task CreateMenu_RejectsANameOneOverTheCap_AndWritesNothing()
    {
        ValidationException ex = await Assert.ThrowsAsync<ValidationException>(
            () => CreateMenuAsync(name: Repeat(MenuFields.MaxNameLength + 1)));

        Assert.Equal(ErrorCodes.MenuNameTooLong, ex.Code);
        Assert.Empty(_db.Menus);
    }

    [Fact]
    public async Task CreateMenu_AcceptsADescriptionAtTheCap()
    {
        MenuDto menu = await _svc.CreateMenuAsync(RestaurantA, new SaveMenuRequest { Name = "Lunch", Description = Repeat(MenuFields.MaxDescriptionLength) });
        Assert.Equal(MenuFields.MaxDescriptionLength, menu.Description!.Length);
    }

    [Fact]
    public async Task CreateMenu_RejectsADescriptionOneOverTheCap_AndWritesNothing()
    {
        ValidationException ex = await Assert.ThrowsAsync<ValidationException>(
            () => _svc.CreateMenuAsync(RestaurantA, new SaveMenuRequest { Name = "Lunch", Description = Repeat(MenuFields.MaxDescriptionLength + 1) }));

        Assert.Equal(ErrorCodes.MenuDescriptionTooLong, ex.Code);
        Assert.Empty(_db.Menus);
    }

    [Fact]
    public async Task CreateMenu_DefaultsTheCurrencyToEuro_AndStampsBothTimestamps()
    {
        MenuDto menu = await CreateMenuAsync();

        Assert.Equal("EUR", menu.Currency);
        Assert.False(menu.IsPublished);
        Assert.Equal(Now, menu.CreatedAt);
        Assert.Equal(Now, menu.UpdatedAt);
    }

    [Theory]
    [InlineData("USD", "USD")]
    [InlineData("EUR", "EUR")]
    [InlineData(" gbp ", "GBP")]
    public async Task CreateMenu_AcceptsAnActiveIsoCurrency(string given, string stored)
    {
        MenuDto menu = await _svc.CreateMenuAsync(RestaurantA, new SaveMenuRequest { Name = "Lunch", Currency = given });
        Assert.Equal(stored, menu.Currency);
    }

    [Theory]
    [InlineData("ZZZ")]
    [InlineData("XTS")]
    [InlineData("EURO")]
    [InlineData("EU")]
    [InlineData("E1R")]
    [InlineData("€")]
    public async Task CreateMenu_RejectsAnInvalidCurrency_AndWritesNothing(string currency)
    {
        ValidationException ex = await Assert.ThrowsAsync<ValidationException>(
            () => _svc.CreateMenuAsync(RestaurantA, new SaveMenuRequest { Name = "Lunch", Currency = currency }));

        Assert.Equal(ErrorCodes.MenuCurrencyInvalid, ex.Code);
        Assert.Empty(_db.Menus);
    }

    [Fact]
    public async Task UpdateMenu_KeepsTheCurrency_WhenNoneIsSent()
    {
        MenuDto menu = await _svc.CreateMenuAsync(RestaurantA, new SaveMenuRequest { Name = "Lunch", Currency = "CHF" });

        MenuDto updated = await _svc.UpdateMenuAsync(RestaurantA, menu.Id, new SaveMenuRequest { Name = "Dinner" });

        Assert.Equal("Dinner", updated.Name);
        Assert.Equal("CHF", updated.Currency);
    }

    [Theory]
    [InlineData("XX")]
    [InlineData("ZZZ")]
    public async Task UpdateMenu_RejectsAnInvalidCurrency_AndChangesNothing(string currency)
    {
        MenuDto menu = await CreateMenuAsync();

        ValidationException ex = await Assert.ThrowsAsync<ValidationException>(
            () => _svc.UpdateMenuAsync(RestaurantA, menu.Id, new SaveMenuRequest { Name = "Renamed", Currency = currency }));

        Assert.Equal(ErrorCodes.MenuCurrencyInvalid, ex.Code);
        Menu stored = await _db.Menus.AsNoTracking().SingleAsync();
        Assert.Equal("Lunch", stored.Name);
        Assert.Equal("EUR", stored.Currency);
    }

    [Fact]
    public async Task CreateMenu_ForAnUnknownRestaurant_IsNotFound()
    {
        NotFoundException ex = await Assert.ThrowsAsync<NotFoundException>(() => CreateMenuAsync(restaurantId: 99));
        Assert.Equal(ErrorCodes.MenuNotFound, ex.Code);
        Assert.Empty(_db.Menus);
    }

    // ── Item validation ──────────────────────────────────────────────────────

    [Theory]
    [InlineData(0L)]
    [InlineData(null)]
    [InlineData(MenuFields.MaxPriceMinor)]
    public async Task CreateItem_AcceptsFreeOnRequestAndCappedPrices(long? price)
    {
        MenuDto menu = await CreateMenuAsync();
        MenuCategoryDto category = await CreateCategoryAsync(menu.Id);

        MenuItemDto item = await CreateItemAsync(category.Id, price: price);

        Assert.Equal(price, item.PriceMinor);
    }

    [Theory]
    [InlineData(-1L)]
    [InlineData(MenuFields.MaxPriceMinor + 1)]
    public async Task CreateItem_RejectsAPriceOutsideTheRange_AndWritesNothing(long price)
    {
        MenuDto menu = await CreateMenuAsync();
        MenuCategoryDto category = await CreateCategoryAsync(menu.Id);

        ValidationException ex = await Assert.ThrowsAsync<ValidationException>(() => CreateItemAsync(category.Id, price: price));

        Assert.Equal(ErrorCodes.MenuPriceInvalid, ex.Code);
        Assert.Empty(_db.MenuItems);
    }

    [Fact]
    public async Task CreateItem_RejectsAnEmptyName_AndWritesNothing()
    {
        MenuDto menu = await CreateMenuAsync();
        MenuCategoryDto category = await CreateCategoryAsync(menu.Id);

        ValidationException ex = await Assert.ThrowsAsync<ValidationException>(() => CreateItemAsync(category.Id, name: " "));

        Assert.Equal(ErrorCodes.MenuItemNameRequired, ex.Code);
        Assert.Empty(_db.MenuItems);
    }

    [Fact]
    public async Task CreateCategory_RejectsANameOneOverTheCap_AndWritesNothing()
    {
        MenuDto menu = await CreateMenuAsync();

        ValidationException ex = await Assert.ThrowsAsync<ValidationException>(
            () => CreateCategoryAsync(menu.Id, name: Repeat(MenuFields.MaxNameLength + 1)));

        Assert.Equal(ErrorCodes.MenuCategoryNameTooLong, ex.Code);
        Assert.Empty(_db.MenuCategories);
    }

    [Fact]
    public async Task CreateItem_StoresAllergensDietaryTagsAndAvailability()
    {
        MenuDto menu = await CreateMenuAsync();
        MenuCategoryDto category = await CreateCategoryAsync(menu.Id);

        MenuItemDto item = await _svc.CreateItemAsync(RestaurantA, category.Id, new SaveMenuItemRequest
        {
            Name = "Quiche",
            Availability = "SoldOut",
            Allergens = ["Milk", "Gluten", "Eggs", "Milk"],
            DietaryTags = ["Vegetarian"],
        });

        Assert.Equal("SoldOut", item.Availability);
        Assert.Equal(["Gluten", "Eggs", "Milk"], item.Allergens);
        Assert.Equal(["Vegetarian"], item.DietaryTags);
        MenuItem stored = await _db.MenuItems.AsNoTracking().SingleAsync();
        Assert.Equal(Allergens.Gluten | Allergens.Eggs | Allergens.Milk, stored.Allergens);
    }

    [Theory]
    [InlineData("Peanut")]
    [InlineData("gluten")]
    [InlineData("None")]
    [InlineData("64")]
    public async Task CreateItem_RejectsAnUnknownAllergen_AndWritesNothing(string allergen)
    {
        MenuDto menu = await CreateMenuAsync();
        MenuCategoryDto category = await CreateCategoryAsync(menu.Id);

        ValidationException ex = await Assert.ThrowsAsync<ValidationException>(() => _svc.CreateItemAsync(RestaurantA, category.Id,
            new SaveMenuItemRequest { Name = "Satay", Allergens = ["Peanuts", allergen] }));

        Assert.Equal(ErrorCodes.MenuAllergenInvalid, ex.Code);
        Assert.Empty(_db.MenuItems);
    }

    [Fact]
    public async Task CreateItem_RejectsAnUnknownDietaryTag_AndWritesNothing()
    {
        MenuDto menu = await CreateMenuAsync();
        MenuCategoryDto category = await CreateCategoryAsync(menu.Id);

        ValidationException ex = await Assert.ThrowsAsync<ValidationException>(() => _svc.CreateItemAsync(RestaurantA, category.Id,
            new SaveMenuItemRequest { Name = "Salad", DietaryTags = ["Keto"] }));

        Assert.Equal(ErrorCodes.MenuDietaryTagInvalid, ex.Code);
        Assert.Empty(_db.MenuItems);
    }

    [Fact]
    public async Task CreateItem_RejectsAnUnknownAvailability_AndWritesNothing()
    {
        MenuDto menu = await CreateMenuAsync();
        MenuCategoryDto category = await CreateCategoryAsync(menu.Id);

        ValidationException ex = await Assert.ThrowsAsync<ValidationException>(() => CreateItemAsync(category.Id, availability: "Gone"));

        Assert.Equal(ErrorCodes.MenuAvailabilityInvalid, ex.Code);
        Assert.Empty(_db.MenuItems);
    }

    [Fact]
    public async Task UpdateItem_RecordsTheChangedFieldsInTheAudit()
    {
        MenuDto menu = await CreateMenuAsync();
        MenuCategoryDto category = await CreateCategoryAsync(menu.Id);
        MenuItemDto item = await CreateItemAsync(category.Id, price: 900);

        await _svc.UpdateItemAsync(RestaurantA, item.Id, new SaveMenuItemRequest { Name = "Soup", PriceMinor = 1100, Allergens = ["Celery"] });

        Assert.Equal(AuditActions.MenuItemUpdate, _audit.Action);
        Assert.Equal(RestaurantA, _audit.RestaurantId);
        string changes = _audit.ChangesJson()!;
        Assert.Contains("priceMinor", changes, StringComparison.Ordinal);
        Assert.Contains("Celery", changes, StringComparison.Ordinal);
        Assert.DoesNotContain("\"name\"", changes, StringComparison.Ordinal);
    }

    // ── Ordering ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task Create_AppendsAfterTheExistingSiblings()
    {
        MenuDto first = await CreateMenuAsync(name: "Lunch");
        MenuDto second = await CreateMenuAsync(name: "Drinks");
        MenuCategoryDto starters = await CreateCategoryAsync(first.Id, "Starters");
        MenuCategoryDto mains = await CreateCategoryAsync(first.Id, "Mains");

        Assert.Equal(0, first.SortOrder);
        Assert.Equal(1, second.SortOrder);
        Assert.Equal(0, starters.SortOrder);
        Assert.Equal(1, mains.SortOrder);
    }

    [Fact]
    public async Task ReorderCategories_AppliesTheGivenOrder()
    {
        MenuDto menu = await CreateMenuAsync();
        MenuCategoryDto a = await CreateCategoryAsync(menu.Id, "A");
        MenuCategoryDto b = await CreateCategoryAsync(menu.Id, "B");
        MenuCategoryDto c = await CreateCategoryAsync(menu.Id, "C");

        await _svc.ReorderCategoriesAsync(RestaurantA, menu.Id, [c.Id, a.Id, b.Id]);

        MenuDto reloaded = await _svc.GetMenuAsync(RestaurantA, menu.Id);
        Assert.Equal(["C", "A", "B"], reloaded.Categories.Select(x => x.Name));
    }

    public static TheoryData<string> BadOrders => new() { "missing", "duplicate", "foreign" };

    [Theory]
    [MemberData(nameof(BadOrders))]
    public async Task ReorderCategories_RejectsAnIncompleteList_AndMovesNothing(string shape)
    {
        MenuDto menu = await CreateMenuAsync();
        MenuCategoryDto a = await CreateCategoryAsync(menu.Id, "A");
        MenuCategoryDto b = await CreateCategoryAsync(menu.Id, "B");
        MenuDto other = await CreateMenuAsync(name: "Other");
        MenuCategoryDto foreign = await CreateCategoryAsync(other.Id, "Foreign");
        List<int> ids = shape switch
        {
            "missing" => [b.Id],
            "duplicate" => [b.Id, b.Id],
            _ => [b.Id, foreign.Id],
        };

        ValidationException ex = await Assert.ThrowsAsync<ValidationException>(
            () => _svc.ReorderCategoriesAsync(RestaurantA, menu.Id, ids));

        Assert.Equal(ErrorCodes.MenuReorderIdsMismatch, ex.Code);
        Dictionary<int, int> orders = await _db.MenuCategories.AsNoTracking().ToDictionaryAsync(x => x.Id, x => x.SortOrder);
        Assert.Equal(0, orders[a.Id]);
        Assert.Equal(1, orders[b.Id]);
    }

    [Fact]
    public async Task ReorderMenusAndItems_ApplyTheGivenOrder()
    {
        MenuDto lunch = await CreateMenuAsync(name: "Lunch");
        MenuDto drinks = await CreateMenuAsync(name: "Drinks");
        MenuCategoryDto category = await CreateCategoryAsync(lunch.Id);
        MenuItemDto soup = await CreateItemAsync(category.Id, "Soup");
        MenuItemDto salad = await CreateItemAsync(category.Id, "Salad");

        await _svc.ReorderMenusAsync(RestaurantA, [drinks.Id, lunch.Id]);
        await _svc.ReorderItemsAsync(RestaurantA, category.Id, [salad.Id, soup.Id]);

        List<MenuDto> menus = await _svc.GetMenusAsync(RestaurantA);
        Assert.Equal(["Drinks", "Lunch"], menus.Select(m => m.Name));
        Assert.Equal(["Salad", "Soup"], menus[1].Categories[0].Items.Select(i => i.Name));
    }

    // ── Cascades and photos ──────────────────────────────────────────────────

    [Fact]
    public async Task DeleteMenu_RemovesItsCategoriesItemsAndPhotos_AndLeavesBookingsAlone()
    {
        _db.Bookings.Add(new Booking { Id = 1, RestaurantId = RestaurantA, TableId = 1, SectionId = 1, CustomerEmail = "guest@example.com", BookingRef = "REF1", Date = Now });
        await _db.SaveChangesAsync();
        MenuDto menu = await CreateMenuAsync();
        MenuDto kept = await CreateMenuAsync(name: "Kept");
        MenuCategoryDto category = await CreateCategoryAsync(menu.Id);
        MenuItemDto item = await CreateItemAsync(category.Id);
        await _svc.UploadItemPhotoAsync(RestaurantA, item.Id, new MemoryStream([1]), "image/png");

        await _svc.DeleteMenuAsync(RestaurantA, menu.Id);

        Assert.Equal([kept.Id], await _db.Menus.Select(m => m.Id).ToListAsync());
        Assert.Empty(_db.MenuCategories);
        Assert.Empty(_db.MenuItems);
        _store.Verify(s => s.TryDelete($"/media/dish-{item.Id}.png"), Times.Once);
        Assert.Equal(1, await _db.Bookings.CountAsync());
        Assert.Equal(AuditActions.MenuDelete, _audit.Action);
    }

    [Fact]
    public async Task DeleteCategory_RemovesItsItemsAndPhotos_AndLeavesSiblings()
    {
        MenuDto menu = await CreateMenuAsync();
        MenuCategoryDto doomed = await CreateCategoryAsync(menu.Id, "Doomed");
        MenuCategoryDto sibling = await CreateCategoryAsync(menu.Id, "Sibling");
        MenuItemDto withPhoto = await CreateItemAsync(doomed.Id, "Photo");
        MenuItemDto survivor = await CreateItemAsync(sibling.Id, "Survivor");
        await _svc.UploadItemPhotoAsync(RestaurantA, withPhoto.Id, new MemoryStream([1]), "image/jpeg");

        await _svc.DeleteCategoryAsync(RestaurantA, doomed.Id);

        Assert.Equal([sibling.Id], await _db.MenuCategories.Select(c => c.Id).ToListAsync());
        Assert.Equal([survivor.Id], await _db.MenuItems.Select(i => i.Id).ToListAsync());
        _store.Verify(s => s.TryDelete($"/media/dish-{withPhoto.Id}.jpg"), Times.Once);
    }

    [Fact]
    public async Task DeleteItem_DeletesItsPhoto()
    {
        MenuDto menu = await CreateMenuAsync();
        MenuCategoryDto category = await CreateCategoryAsync(menu.Id);
        MenuItemDto item = await CreateItemAsync(category.Id);
        await _svc.UploadItemPhotoAsync(RestaurantA, item.Id, new MemoryStream([1]), "image/webp");

        await _svc.DeleteItemAsync(RestaurantA, item.Id);

        Assert.Empty(_db.MenuItems);
        _store.Verify(s => s.TryDelete($"/media/dish-{item.Id}.webp"), Times.Once);
    }

    [Fact]
    public async Task DeleteItem_WithoutAPhoto_TouchesNoFile()
    {
        MenuDto menu = await CreateMenuAsync();
        MenuCategoryDto category = await CreateCategoryAsync(menu.Id);
        MenuItemDto item = await CreateItemAsync(category.Id);

        await _svc.DeleteItemAsync(RestaurantA, item.Id);

        _store.Verify(s => s.TryDelete(It.IsAny<string>()), Times.Never);
    }

    [Fact]
    public async Task UploadItemPhoto_WritesTheDishSlot_AndStoresItsUrl()
    {
        MenuDto menu = await CreateMenuAsync();
        MenuCategoryDto category = await CreateCategoryAsync(menu.Id);
        MenuItemDto item = await CreateItemAsync(category.Id);

        MenuItemDto updated = await _svc.UploadItemPhotoAsync(RestaurantA, item.Id, new MemoryStream([1]), "image/jpeg");

        _store.Verify(s => s.ReplaceAsync($"dish-{item.Id}", "jpg", It.IsAny<Stream>()), Times.Once);
        Assert.StartsWith($"/media/dish-{item.Id}.jpg?v=", updated.ImageUrl, StringComparison.Ordinal);
        Assert.Equal(AuditActions.MenuItemPhotoUpload, _audit.Action);
    }

    [Fact]
    public async Task DeleteItemPhoto_ClearsTheUrl_AndDeletesTheFile()
    {
        MenuDto menu = await CreateMenuAsync();
        MenuCategoryDto category = await CreateCategoryAsync(menu.Id);
        MenuItemDto item = await CreateItemAsync(category.Id);
        await _svc.UploadItemPhotoAsync(RestaurantA, item.Id, new MemoryStream([1]), "image/png");

        await _svc.DeleteItemPhotoAsync(RestaurantA, item.Id);

        Assert.Null((await _db.MenuItems.AsNoTracking().SingleAsync()).ImageUrl);
        _store.Verify(s => s.TryDelete($"/media/dish-{item.Id}.png"), Times.Once);
    }

    // ── Another restaurant's rows ────────────────────────────────────────────

    [Fact]
    public async Task UpdateItem_ThroughAnotherRestaurant_IsNotFound_AndChangesNothing()
    {
        MenuDto menu = await CreateMenuAsync();
        MenuCategoryDto category = await CreateCategoryAsync(menu.Id);
        MenuItemDto item = await CreateItemAsync(category.Id, "Soup");

        NotFoundException ex = await Assert.ThrowsAsync<NotFoundException>(
            () => _svc.UpdateItemAsync(RestaurantB, item.Id, new SaveMenuItemRequest { Name = "Hijacked" }));

        Assert.Equal(ErrorCodes.MenuNotFound, ex.Code);
        Assert.Equal("Soup", (await _db.MenuItems.AsNoTracking().SingleAsync()).Name);
    }

    [Fact]
    public async Task CreateCategory_OnAnotherRestaurantsMenu_IsNotFound_AndWritesNothing()
    {
        MenuDto menu = await CreateMenuAsync();

        await Assert.ThrowsAsync<NotFoundException>(() => CreateCategoryAsync(menu.Id, restaurantId: RestaurantB));

        Assert.Empty(_db.MenuCategories);
    }

    [Fact]
    public async Task DeleteMenu_ThroughAnotherRestaurant_IsNotFound_AndDeletesNothing()
    {
        MenuDto menu = await CreateMenuAsync();

        await Assert.ThrowsAsync<NotFoundException>(() => _svc.DeleteMenuAsync(RestaurantB, menu.Id));

        Assert.Single(_db.Menus);
    }

    // ── Publishing and the public view ───────────────────────────────────────

    private async Task<(MenuDto Menu, MenuCategoryDto Category)> PublishedMenuAsync()
    {
        MenuDto menu = await CreateMenuAsync();
        MenuCategoryDto category = await CreateCategoryAsync(menu.Id, "Mains");
        await _svc.SetPublishedAsync(RestaurantA, menu.Id, published: true);
        return (menu, category);
    }

    [Fact]
    public async Task PublicMenu_ListsOnlyPublishedMenusVisibleCategoriesAndUnhiddenItems()
    {
        (MenuDto _, MenuCategoryDto mains) = await PublishedMenuAsync();
        await CreateItemAsync(mains.Id, "Steak");
        await CreateItemAsync(mains.Id, "Sold out fish", availability: "SoldOut");
        await CreateItemAsync(mains.Id, "Secret", availability: "Hidden");
        MenuDto lunch = (await _svc.GetMenusAsync(RestaurantA))[0];
        MenuCategoryDto hidden = await CreateCategoryAsync(lunch.Id, "Staff only", visible: false);
        await CreateItemAsync(hidden.Id, "Staff meal");
        MenuDto draft = await CreateMenuAsync(name: "Draft");
        await CreateCategoryAsync(draft.Id, "Draft category");

        PublicMenuResponse response = await _svc.GetPublicMenuByRestaurantTokenAsync("token-alpha");

        Assert.Equal("Alpha", response.Restaurant.Name);
        Assert.Equal("Europe/Paris", response.Restaurant.Timezone);
        Assert.Null(response.Table);
        PublicMenuDto menu = Assert.Single(response.Menus);
        Assert.Equal("Lunch", menu.Name);
        PublicMenuCategoryDto category = Assert.Single(menu.Categories);
        Assert.Equal(["Steak", "Sold out fish"], category.Items.Select(i => i.Name));
        Assert.Equal(["Available", "SoldOut"], category.Items.Select(i => i.Availability));
    }

    [Fact]
    public async Task PublicMenu_NotFound_WhenNothingIsPublished()
    {
        MenuDto menu = await CreateMenuAsync();
        await _svc.SetPublishedAsync(RestaurantA, menu.Id, published: true);
        await _svc.SetPublishedAsync(RestaurantA, menu.Id, published: false);

        NotFoundException ex = await Assert.ThrowsAsync<NotFoundException>(() => _svc.GetPublicMenuByRestaurantTokenAsync("token-alpha"));
        Assert.Equal(ErrorCodes.MenuNotFound, ex.Code);
    }

    [Fact]
    public async Task PublicMenu_NotFound_WhenTheRestaurantIsArchived()
    {
        await PublishedMenuAsync();
        Restaurant alpha = await _db.Restaurants.SingleAsync(r => r.Id == RestaurantA);
        alpha.IsArchived = true;
        await _db.SaveChangesAsync();

        await Assert.ThrowsAsync<NotFoundException>(() => _svc.GetPublicMenuByRestaurantTokenAsync("token-alpha"));
        await Assert.ThrowsAsync<NotFoundException>(() => _svc.GetPublicMenuByTableTokenAsync("table-alpha-1"));
    }

    [Theory]
    [InlineData("no-such-token")]
    [InlineData("")]
    [InlineData("this-token-is-far-longer-than-any-minted-one")]
    public async Task PublicMenu_NotFound_ForATokenNothingCarries(string token)
    {
        await PublishedMenuAsync();

        await Assert.ThrowsAsync<NotFoundException>(() => _svc.GetPublicMenuByRestaurantTokenAsync(token));
        await Assert.ThrowsAsync<NotFoundException>(() => _svc.GetPublicMenuByTableTokenAsync(token));
    }

    [Fact]
    public async Task PublicMenuByTable_ShowsTheTablesRestaurantAndTheTableName()
    {
        await PublishedMenuAsync();

        PublicMenuResponse response = await _svc.GetPublicMenuByTableTokenAsync("table-alpha-1");

        Assert.Equal("Alpha", response.Restaurant.Name);
        Assert.Equal("T1", response.Table!.Name);
        Assert.Single(response.Menus);
    }

    [Fact]
    public async Task PublicMenuByTable_NotFound_WhenTheTablesRestaurantPublishedNothing()
    {
        await PublishedMenuAsync();

        await Assert.ThrowsAsync<NotFoundException>(() => _svc.GetPublicMenuByTableTokenAsync("table-beta-2"));
    }

    // ── Tokens ───────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetPublicTokens_ListsTheRestaurantAndOnlyItsOwnTables()
    {
        MenuPublicTokensDto tokens = await _svc.GetPublicTokensAsync(RestaurantA);

        Assert.Equal("token-alpha", tokens.RestaurantToken);
        TablePublicTokenDto table = Assert.Single(tokens.Tables);
        Assert.Equal("table-alpha-1", table.Token);
        Assert.Equal("Terrace", table.SectionName);
    }

    [Fact]
    public async Task RegenerateRestaurantToken_RetiresTheOldLink_WithoutAuditingTheTokens()
    {
        await PublishedMenuAsync();
        var audit = new AuditScope();
        var svc = new MenuService(new MenuRepository(_db), new Mock<MediaService>(
            Mock.Of<IBrandSettingsRepository>(), Mock.Of<IRestaurantRepository>(), _store.Object).Object, new FakeClock(Now), audit);

        RegeneratedTokenDto result = await svc.RegenerateRestaurantTokenAsync(RestaurantA);

        Assert.NotEqual("token-alpha", result.Token);
        Assert.Equal(PublicTokenGenerator.New().Length, result.Token.Length);
        await Assert.ThrowsAsync<NotFoundException>(() => _svc.GetPublicMenuByRestaurantTokenAsync("token-alpha"));
        Assert.Single((await _svc.GetPublicMenuByRestaurantTokenAsync(result.Token)).Menus);
        Assert.Equal(AuditActions.MenuTokenRegenerate, audit.Action);
        Assert.DoesNotContain(result.Token, audit.Summary!, StringComparison.Ordinal);
        Assert.DoesNotContain("token-alpha", audit.Summary!, StringComparison.Ordinal);
        Assert.Null(audit.ChangesJson());
    }

    [Fact]
    public async Task RegenerateTableToken_ReplacesOnlyThatTablesToken()
    {
        RegeneratedTokenDto result = await _svc.RegenerateTableTokenAsync(RestaurantA, 1);

        Assert.Equal(result.Token, (await _db.Tables.AsNoTracking().SingleAsync(t => t.Id == 1)).PublicToken);
        Assert.Equal("table-beta-2", (await _db.Tables.AsNoTracking().SingleAsync(t => t.Id == 2)).PublicToken);
        Assert.Equal("token-alpha", (await _db.Restaurants.AsNoTracking().SingleAsync(r => r.Id == RestaurantA)).PublicToken);
    }

    [Fact]
    public async Task RegenerateTableToken_OfAnotherRestaurantsTable_IsNotFound_AndKeepsTheToken()
    {
        await Assert.ThrowsAsync<NotFoundException>(() => _svc.RegenerateTableTokenAsync(RestaurantA, 2));

        Assert.Equal("table-beta-2", (await _db.Tables.AsNoTracking().SingleAsync(t => t.Id == 2)).PublicToken);
    }
}
