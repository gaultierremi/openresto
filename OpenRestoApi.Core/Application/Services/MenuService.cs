using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Application.Exceptions;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Site;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Services;

/// <summary>
/// A restaurant's menus, their categories and items, the photos on those items, the public
/// tokens a QR code carries, and the read-only view a guest gets through one.
/// </summary>
public class MenuService(
    IMenuRepository menuRepository,
    MediaService media,
    ISystemClock clock,
    IAuditScope? audit = null)
{
    private readonly IMenuRepository _repo = menuRepository;
    private readonly MediaService _media = media;
    private readonly ISystemClock _clock = clock;
    private readonly IAuditScope _audit = audit ?? NullAuditScope.Instance;

    // ── Menus ────────────────────────────────────────────────────────────────

    public async Task<List<MenuDto>> GetMenusAsync(int restaurantId)
    {
        await RequireRestaurantAsync(restaurantId);
        List<Menu> menus = await _repo.GetMenusWithContentAsync(restaurantId);
        return Ordered(menus).Select(ToDto).ToList();
    }

    public async Task<MenuDto> GetMenuAsync(int restaurantId, int menuId)
        => ToDto(await RequireMenuAsync(restaurantId, menuId));

    public async Task<MenuDto> CreateMenuAsync(int restaurantId, SaveMenuRequest req)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId);
        string name = RequireName(req.Name, ErrorCodes.MenuNameRequired, ErrorCodes.MenuNameTooLong, "Menu name");
        string? description = NormalizeDescription(req.Description);
        string currency = NormalizeCurrency(req.Currency, Menu.DefaultCurrency);

        List<Menu> siblings = await _repo.GetMenusWithContentAsync(restaurantId);
        DateTime now = _clock.UtcNow;
        var menu = new Menu
        {
            RestaurantId = restaurant.Id,
            Name = name,
            Description = description,
            Currency = currency,
            SortOrder = NextSortOrder(siblings.Select(m => m.SortOrder)),
            CreatedAt = now,
            UpdatedAt = now,
        };
        _repo.Add(menu);
        await _repo.SaveChangesAsync();

        DescribeMenu(AuditActions.MenuCreate, menu, $"Added the menu \"{menu.Name}\" to {restaurant.Name}");
        return ToDto(menu);
    }

    public async Task<MenuDto> UpdateMenuAsync(int restaurantId, int menuId, SaveMenuRequest req)
    {
        Menu menu = await RequireMenuAsync(restaurantId, menuId);
        string name = RequireName(req.Name, ErrorCodes.MenuNameRequired, ErrorCodes.MenuNameTooLong, "Menu name");
        string? description = NormalizeDescription(req.Description);
        string currency = NormalizeCurrency(req.Currency, menu.Currency);

        _audit.RecordChange("name", menu.Name, name);
        _audit.RecordChange("description", menu.Description, description);
        _audit.RecordChange("currency", menu.Currency, currency);
        menu.Name = name;
        menu.Description = description;
        menu.Currency = currency;
        menu.UpdatedAt = _clock.UtcNow;
        await _repo.SaveChangesAsync();

        DescribeMenu(AuditActions.MenuUpdate, menu, $"Edited the menu \"{menu.Name}\"");
        return ToDto(menu);
    }

    public async Task DeleteMenuAsync(int restaurantId, int menuId)
    {
        Menu menu = await RequireMenuAsync(restaurantId, menuId);
        List<string> photos = menu.Categories.SelectMany(c => c.Items).Select(i => i.ImageUrl).OfType<string>().ToList();

        _repo.Remove(menu);
        await _repo.SaveChangesAsync();
        photos.ForEach(_media.DeleteDishPhoto);

        DescribeMenu(AuditActions.MenuDelete, menu, $"Deleted the menu \"{menu.Name}\"");
    }

    public async Task<MenuDto> SetPublishedAsync(int restaurantId, int menuId, bool published)
    {
        Menu menu = await RequireMenuAsync(restaurantId, menuId);
        _audit.RecordChange("isPublished", menu.IsPublished, published);
        menu.IsPublished = published;
        menu.UpdatedAt = _clock.UtcNow;
        await _repo.SaveChangesAsync();

        DescribeMenu(
            published ? AuditActions.MenuPublish : AuditActions.MenuUnpublish,
            menu,
            published ? $"Published the menu \"{menu.Name}\"" : $"Unpublished the menu \"{menu.Name}\"");
        return ToDto(menu);
    }

    public async Task ReorderMenusAsync(int restaurantId, List<int> ids)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId);
        List<Menu> menus = await _repo.GetMenusWithContentAsync(restaurantId);
        ApplyOrder(menus, m => m.Id, (m, order) => m.SortOrder = order, ids);
        await _repo.SaveChangesAsync();

        _audit.Describe(AuditActions.MenuReorder, AuditTargets.Restaurant, AuditTargets.IdOf(restaurant.Id),
            restaurant.Name, restaurant.Id, $"Reordered the menus of {restaurant.Name}");
    }

    // ── Categories ───────────────────────────────────────────────────────────

    public async Task<MenuCategoryDto> CreateCategoryAsync(int restaurantId, int menuId, SaveMenuCategoryRequest req)
    {
        Menu menu = await RequireMenuAsync(restaurantId, menuId);
        string name = RequireName(req.Name, ErrorCodes.MenuCategoryNameRequired, ErrorCodes.MenuCategoryNameTooLong, "Category name");
        string? description = NormalizeDescription(req.Description);

        var category = new MenuCategory
        {
            MenuId = menu.Id,
            Name = name,
            Description = description,
            IsVisible = req.IsVisible,
            SortOrder = NextSortOrder(menu.Categories.Select(c => c.SortOrder)),
        };
        _repo.Add(category);
        menu.UpdatedAt = _clock.UtcNow;
        await _repo.SaveChangesAsync();

        DescribeCategory(AuditActions.MenuCategoryCreate, category, restaurantId,
            $"Added the category \"{category.Name}\" to the menu \"{menu.Name}\"");
        return ToDto(category);
    }

    public async Task<MenuCategoryDto> UpdateCategoryAsync(int restaurantId, int categoryId, SaveMenuCategoryRequest req)
    {
        MenuCategory category = await RequireCategoryAsync(restaurantId, categoryId);
        string name = RequireName(req.Name, ErrorCodes.MenuCategoryNameRequired, ErrorCodes.MenuCategoryNameTooLong, "Category name");
        string? description = NormalizeDescription(req.Description);

        _audit.RecordChange("name", category.Name, name);
        _audit.RecordChange("description", category.Description, description);
        _audit.RecordChange("isVisible", category.IsVisible, req.IsVisible);
        category.Name = name;
        category.Description = description;
        category.IsVisible = req.IsVisible;
        category.Menu!.UpdatedAt = _clock.UtcNow;
        await _repo.SaveChangesAsync();

        DescribeCategory(AuditActions.MenuCategoryUpdate, category, restaurantId,
            $"Edited the category \"{category.Name}\"");
        return ToDto(category);
    }

    public async Task DeleteCategoryAsync(int restaurantId, int categoryId)
    {
        MenuCategory category = await RequireCategoryAsync(restaurantId, categoryId);
        List<string> photos = category.Items.Select(i => i.ImageUrl).OfType<string>().ToList();

        _repo.Remove(category);
        category.Menu!.UpdatedAt = _clock.UtcNow;
        await _repo.SaveChangesAsync();
        photos.ForEach(_media.DeleteDishPhoto);

        DescribeCategory(AuditActions.MenuCategoryDelete, category, restaurantId,
            $"Deleted the category \"{category.Name}\"");
    }

    public async Task ReorderCategoriesAsync(int restaurantId, int menuId, List<int> ids)
    {
        Menu menu = await RequireMenuAsync(restaurantId, menuId);
        ApplyOrder(menu.Categories, c => c.Id, (c, order) => c.SortOrder = order, ids);
        menu.UpdatedAt = _clock.UtcNow;
        await _repo.SaveChangesAsync();

        DescribeMenu(AuditActions.MenuCategoryReorder, menu, $"Reordered the categories of the menu \"{menu.Name}\"");
    }

    // ── Items ────────────────────────────────────────────────────────────────

    public async Task<MenuItemDto> CreateItemAsync(int restaurantId, int categoryId, SaveMenuItemRequest req)
    {
        MenuCategory category = await RequireCategoryAsync(restaurantId, categoryId);
        ItemFields fields = ValidateItem(req);

        var item = new MenuItem
        {
            CategoryId = category.Id,
            SortOrder = NextSortOrder(category.Items.Select(i => i.SortOrder)),
        };
        fields.ApplyTo(item);
        _repo.Add(item);
        category.Menu!.UpdatedAt = _clock.UtcNow;
        await _repo.SaveChangesAsync();

        DescribeItem(AuditActions.MenuItemCreate, item, restaurantId,
            $"Added \"{item.Name}\" to the category \"{category.Name}\"");
        return ToDto(item);
    }

    public async Task<MenuItemDto> UpdateItemAsync(int restaurantId, int itemId, SaveMenuItemRequest req)
    {
        MenuItem item = await RequireItemAsync(restaurantId, itemId);
        ItemFields fields = ValidateItem(req);

        _audit.RecordChange("name", item.Name, fields.Name);
        _audit.RecordChange("description", item.Description, fields.Description);
        _audit.RecordChange("priceMinor", item.PriceMinor, fields.PriceMinor);
        _audit.RecordChange("availability", MenuFields.ToName(item.Availability), MenuFields.ToName(fields.Availability));
        _audit.RecordChange("allergens", string.Join(",", MenuFields.ToNames(item.Allergens)), string.Join(",", MenuFields.ToNames(fields.Allergens)));
        _audit.RecordChange("dietaryTags", string.Join(",", MenuFields.ToNames(item.DietaryTags)), string.Join(",", MenuFields.ToNames(fields.DietaryTags)));
        fields.ApplyTo(item);
        item.Category!.Menu!.UpdatedAt = _clock.UtcNow;
        await _repo.SaveChangesAsync();

        DescribeItem(AuditActions.MenuItemUpdate, item, restaurantId, $"Edited \"{item.Name}\"");
        return ToDto(item);
    }

    public async Task DeleteItemAsync(int restaurantId, int itemId)
    {
        MenuItem item = await RequireItemAsync(restaurantId, itemId);
        string? photo = item.ImageUrl;

        _repo.Remove(item);
        item.Category!.Menu!.UpdatedAt = _clock.UtcNow;
        await _repo.SaveChangesAsync();
        if (photo != null)
        {
            _media.DeleteDishPhoto(photo);
        }

        DescribeItem(AuditActions.MenuItemDelete, item, restaurantId, $"Deleted \"{item.Name}\"");
    }

    public async Task ReorderItemsAsync(int restaurantId, int categoryId, List<int> ids)
    {
        MenuCategory category = await RequireCategoryAsync(restaurantId, categoryId);
        ApplyOrder(category.Items, i => i.Id, (i, order) => i.SortOrder = order, ids);
        category.Menu!.UpdatedAt = _clock.UtcNow;
        await _repo.SaveChangesAsync();

        DescribeCategory(AuditActions.MenuItemReorder, category, restaurantId,
            $"Reordered the items of the category \"{category.Name}\"");
    }

    public async Task<MenuItemDto> UploadItemPhotoAsync(int restaurantId, int itemId, Stream content, string contentType)
    {
        MenuItem item = await RequireItemAsync(restaurantId, itemId);
        string? replaced = item.ImageUrl;
        item.ImageUrl = await _media.StoreDishPhotoAsync(content, contentType);
        item.Category!.Menu!.UpdatedAt = _clock.UtcNow;
        await _repo.SaveChangesAsync();
        if (replaced != null)
        {
            _media.DeleteDishPhoto(replaced);
        }

        DescribeItem(AuditActions.MenuItemPhotoUpload, item, restaurantId, $"Uploaded a photo for \"{item.Name}\"");
        return ToDto(item);
    }

    public async Task DeleteItemPhotoAsync(int restaurantId, int itemId)
    {
        MenuItem item = await RequireItemAsync(restaurantId, itemId);
        if (item.ImageUrl == null)
        {
            return;
        }

        // The reference goes first, so a file already missing from disk never blocks the removal.
        string photo = item.ImageUrl;
        item.ImageUrl = null;
        item.Category!.Menu!.UpdatedAt = _clock.UtcNow;
        await _repo.SaveChangesAsync();
        _media.DeleteDishPhoto(photo);

        DescribeItem(AuditActions.MenuItemPhotoDelete, item, restaurantId, $"Removed the photo of \"{item.Name}\"");
    }

    /// <summary>
    /// The photo of every dish the restaurant holds. Purging the restaurant removes the dishes
    /// through the database cascade, which never reaches this service's own photo cleanup, so
    /// the purge collects these first and hands them to <see cref="DeleteDishPhotos"/> once the
    /// rows are gone.
    /// </summary>
    /// <seealso>MenusControllerTests.RestaurantPurge_RemovesCascadedDishPhotos</seealso>
    public async Task<List<string>> GetDishPhotoUrlsAsync(int restaurantId)
        => (await _repo.GetMenusWithContentAsync(restaurantId))
            .SelectMany(m => m.Categories)
            .SelectMany(c => c.Items)
            .Select(i => i.ImageUrl)
            .OfType<string>()
            .ToList();

    public void DeleteDishPhotos(IEnumerable<string> urls)
    {
        foreach (string url in urls)
        {
            _media.DeleteDishPhoto(url);
        }
    }

    // ── Public tokens ────────────────────────────────────────────────────────

    public async Task<MenuPublicTokensDto> GetPublicTokensAsync(int restaurantId)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId);
        List<Table> tables = await _repo.GetTablesAsync(restaurantId);
        return new MenuPublicTokensDto
        {
            RestaurantToken = restaurant.PublicToken,
            Tables = tables
                .OrderBy(t => t.Section!.SortOrder).ThenBy(t => t.SectionId).ThenBy(t => t.Id)
                .Select(t => new TablePublicTokenDto
                {
                    TableId = t.Id,
                    TableName = t.Name,
                    SectionName = t.Section!.Name,
                    Token = t.PublicToken,
                })
                .ToList(),
        };
    }

    /// <summary>
    /// Replaces the restaurant's token, which retires every QR code printed with the old one.
    /// The token values themselves stay out of the audit entry: what matters is that it changed.
    /// </summary>
    public async Task<RegeneratedTokenDto> RegenerateRestaurantTokenAsync(int restaurantId)
    {
        Restaurant restaurant = await RequireRestaurantAsync(restaurantId);
        restaurant.PublicToken = PublicTokenGenerator.New();
        await _repo.SaveChangesAsync();

        _audit.Describe(AuditActions.MenuTokenRegenerate, AuditTargets.Restaurant, AuditTargets.IdOf(restaurant.Id),
            restaurant.Name, restaurant.Id, $"Regenerated the public menu link of {restaurant.Name}");
        return new RegeneratedTokenDto { Token = restaurant.PublicToken };
    }

    public async Task<RegeneratedTokenDto> RegenerateTableTokenAsync(int restaurantId, int tableId)
    {
        Table table = await _repo.FindTableAsync(restaurantId, tableId) ?? throw NotFound();
        table.PublicToken = PublicTokenGenerator.New();
        await _repo.SaveChangesAsync();

        string label = table.Name ?? $"Table {table.Id}";
        _audit.Describe(AuditActions.MenuTokenRegenerate, AuditTargets.Table, AuditTargets.IdOf(table.Id),
            label, restaurantId, $"Regenerated the public menu link of {label}");
        return new RegeneratedTokenDto { Token = table.PublicToken };
    }

    // ── Public view ──────────────────────────────────────────────────────────

    public async Task<PublicMenuResponse> GetPublicMenuByRestaurantTokenAsync(string token)
    {
        Restaurant restaurant = (IsPlausibleToken(token) ? await _repo.FindRestaurantByTokenAsync(token) : null)
            ?? throw NotFound();
        return await BuildPublicMenuAsync(restaurant, table: null);
    }

    public async Task<PublicMenuResponse> GetPublicMenuByTableTokenAsync(string token)
    {
        Table table = (IsPlausibleToken(token) ? await _repo.FindTableByTokenAsync(token) : null)
            ?? throw NotFound();
        return await BuildPublicMenuAsync(table.Section!.Restaurant!, table);
    }

    /// <summary>
    /// The guest's view: published menus, visible categories, items not hidden. An archived
    /// location or one with nothing published is a 404, the same as an unknown token.
    /// </summary>
    /// <seealso>MenuServiceTests.PublicMenu_ListsOnlyPublishedMenusVisibleCategoriesAndUnhiddenItems</seealso>
    /// <seealso>MenuServiceTests.PublicMenu_NotFound_WhenTheRestaurantIsArchived</seealso>
    /// <seealso>MenuServiceTests.PublicMenu_NotFound_WhenNothingIsPublished</seealso>
    private async Task<PublicMenuResponse> BuildPublicMenuAsync(Restaurant restaurant, Table? table)
    {
        if (!restaurant.IsListedPublicly)
        {
            throw NotFound();
        }

        List<Menu> published = Ordered((await _repo.GetMenusWithContentAsync(restaurant.Id)).Where(m => m.IsPublished)).ToList();
        if (published.Count == 0)
        {
            throw NotFound();
        }

        return new PublicMenuResponse
        {
            Restaurant = new PublicMenuRestaurantDto { Id = restaurant.Id, Name = restaurant.Name, Timezone = restaurant.Timezone },
            Table = table == null ? null : new PublicMenuTableDto { Name = table.Name },
            Menus = published.Select(m => new PublicMenuDto
            {
                Name = m.Name,
                Description = m.Description,
                Currency = m.Currency,
                Categories = VisibleCategories(m).Select(c => new PublicMenuCategoryDto
                {
                    Name = c.Name,
                    Description = c.Description,
                    Items = VisibleItems(c).Select(i => new PublicMenuItemDto
                    {
                        Name = i.Name,
                        Description = i.Description,
                        PriceMinor = i.PriceMinor,
                        ImageUrl = i.ImageUrl,
                        Availability = MenuFields.ToName(i.Availability),
                        Allergens = MenuFields.ToNames(i.Allergens),
                        DietaryTags = MenuFields.ToNames(i.DietaryTags),
                    }).ToList(),
                }).ToList(),
            }).ToList(),
        };
    }

    /// <summary>
    /// The restaurant's published menus as the one-page site shows them: the same filter as the QR
    /// page (published menus, visible categories, items not hidden), in the same order. Empty when
    /// nothing is published; unlike the QR page that is not an error, a site simply has no menu
    /// section.
    /// </summary>
    /// <seealso>MenuServiceTests.PublishedMenuViews_AreTheSameDishesTheQrPageShows</seealso>
    public async Task<List<PublicMenuView>> GetPublishedMenuViewsAsync(int restaurantId)
    {
        List<Menu> menus = await _repo.GetMenusWithContentAsync(restaurantId);
        return Ordered(menus.Where(m => m.IsPublished)).Select(m => new PublicMenuView(
            m.Name,
            m.Description,
            m.Currency,
            VisibleCategories(m).Select(c => new PublicMenuCategoryView(
                c.Name,
                c.Description,
                VisibleItems(c).Select(i => new PublicMenuItemView(
                    i.Name,
                    i.Description,
                    i.PriceMinor,
                    i.ImageUrl,
                    i.Availability == MenuItemAvailability.SoldOut,
                    i.Allergens,
                    i.DietaryTags)).ToList())).ToList())).ToList();
    }

    private static IEnumerable<MenuCategory> VisibleCategories(Menu menu) => Ordered(menu.Categories.Where(c => c.IsVisible));

    private static IEnumerable<MenuItem> VisibleItems(MenuCategory category)
        => Ordered(category.Items.Where(i => i.Availability != MenuItemAvailability.Hidden));

    /// <summary>A token that could never have been minted is turned away before any query.</summary>
    private static bool IsPlausibleToken(string? token)
        => !string.IsNullOrEmpty(token) && token.Length <= PublicTokenGenerator.MaxLength;

    // ── Lookups ──────────────────────────────────────────────────────────────

    private static NotFoundException NotFound()
        => new("Menu not found.") { Code = ErrorCodes.MenuNotFound };

    private async Task<Restaurant> RequireRestaurantAsync(int restaurantId)
        => await _repo.FindRestaurantAsync(restaurantId) ?? throw NotFound();

    private async Task<Menu> RequireMenuAsync(int restaurantId, int menuId)
        => await _repo.FindMenuAsync(restaurantId, menuId) ?? throw NotFound();

    private async Task<MenuCategory> RequireCategoryAsync(int restaurantId, int categoryId)
        => await _repo.FindCategoryAsync(restaurantId, categoryId) ?? throw NotFound();

    private async Task<MenuItem> RequireItemAsync(int restaurantId, int itemId)
        => await _repo.FindItemAsync(restaurantId, itemId) ?? throw NotFound();

    // ── Ordering ─────────────────────────────────────────────────────────────

    private static IEnumerable<Menu> Ordered(IEnumerable<Menu> menus) => menus.OrderBy(m => m.SortOrder).ThenBy(m => m.Id);
    private static IEnumerable<MenuCategory> Ordered(IEnumerable<MenuCategory> categories) => categories.OrderBy(c => c.SortOrder).ThenBy(c => c.Id);
    private static IEnumerable<MenuItem> Ordered(IEnumerable<MenuItem> items) => items.OrderBy(i => i.SortOrder).ThenBy(i => i.Id);

    private static int NextSortOrder(IEnumerable<int> siblingOrders)
        => siblingOrders.DefaultIfEmpty(-1).Max() + 1;

    /// <summary>
    /// Writes each sibling's position from <paramref name="ids"/>, which must name every sibling
    /// exactly once. Anything else is refused before a single row moves.
    /// </summary>
    /// <seealso>MenuServiceTests.ReorderCategories_AppliesTheGivenOrder</seealso>
    /// <seealso>MenuServiceTests.ReorderCategories_RejectsAnIncompleteList_AndMovesNothing</seealso>
    private static void ApplyOrder<T>(IEnumerable<T> siblings, Func<T, int> idOf, Action<T, int> setOrder, List<int>? ids)
    {
        Dictionary<int, T> byId = siblings.ToDictionary(idOf);
        ids ??= [];
        if (ids.Count != byId.Count || ids.Distinct().Count() != ids.Count || !ids.All(byId.ContainsKey))
        {
            throw new ValidationException("ids must list every entry exactly once, with no additions.")
            { Code = ErrorCodes.MenuReorderIdsMismatch };
        }
        for (int i = 0; i < ids.Count; i++)
        {
            setOrder(byId[ids[i]], i);
        }
    }

    // ── Validation ───────────────────────────────────────────────────────────

    private readonly record struct ItemFields(
        string Name,
        string? Description,
        long? PriceMinor,
        MenuItemAvailability Availability,
        Allergens Allergens,
        DietaryTags DietaryTags)
    {
        public void ApplyTo(MenuItem item)
        {
            item.Name = Name;
            item.Description = Description;
            item.PriceMinor = PriceMinor;
            item.Availability = Availability;
            item.Allergens = Allergens;
            item.DietaryTags = DietaryTags;
        }
    }

    private static ItemFields ValidateItem(SaveMenuItemRequest req)
    {
        string name = RequireName(req.Name, ErrorCodes.MenuItemNameRequired, ErrorCodes.MenuItemNameTooLong, "Item name");
        string? description = NormalizeDescription(req.Description);

        if (req.PriceMinor is < 0 or > MenuFields.MaxPriceMinor)
        {
            throw new ValidationException($"Price must be between 0 and {MenuFields.MaxPriceMinor} minor units, or empty for \"price on request\".")
            { Code = ErrorCodes.MenuPriceInvalid, Args = new Dictionary<string, object> { ["max"] = MenuFields.MaxPriceMinor } };
        }

        MenuItemAvailability availability = MenuItemAvailability.Available;
        if (req.Availability != null && !MenuFields.TryParseAvailability(req.Availability, out availability))
        {
            throw new ValidationException("Availability must be one of: Available, SoldOut, Hidden.")
            { Code = ErrorCodes.MenuAvailabilityInvalid };
        }

        if (!MenuFields.TryParseFlags(req.Allergens, out Allergens allergens))
        {
            throw new ValidationException("Allergens must be names from the 14 EU allergens, e.g. \"Gluten\".")
            { Code = ErrorCodes.MenuAllergenInvalid };
        }

        if (!MenuFields.TryParseFlags(req.DietaryTags, out DietaryTags dietaryTags))
        {
            throw new ValidationException("Dietary tags must be one of: Vegetarian, Vegan, GlutenFree.")
            { Code = ErrorCodes.MenuDietaryTagInvalid };
        }

        return new ItemFields(name, description, req.PriceMinor, availability, allergens, dietaryTags);
    }

    private static string RequireName(string? raw, string requiredCode, string tooLongCode, string label)
    {
        string name = (raw ?? string.Empty).Trim();
        if (name.Length == 0)
        {
            throw new ValidationException($"{label} cannot be empty.") { Code = requiredCode };
        }
        if (name.Length > MenuFields.MaxNameLength)
        {
            throw new ValidationException($"{label} cannot exceed {MenuFields.MaxNameLength} characters.")
            { Code = tooLongCode, Args = new Dictionary<string, object> { ["max"] = MenuFields.MaxNameLength } };
        }
        return name;
    }

    private static string? NormalizeDescription(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return null;
        }
        string description = raw.Trim();
        if (description.Length > MenuFields.MaxDescriptionLength)
        {
            throw new ValidationException($"Description cannot exceed {MenuFields.MaxDescriptionLength} characters.")
            { Code = ErrorCodes.MenuDescriptionTooLong, Args = new Dictionary<string, object> { ["max"] = MenuFields.MaxDescriptionLength } };
        }
        return description;
    }

    /// <summary>Blank keeps <paramref name="fallback"/>; anything else must be an active ISO 4217 code (<see cref="MenuFields.IsValidCurrency"/>).</summary>
    private static string NormalizeCurrency(string? raw, string fallback)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return fallback;
        }
        string currency = raw.Trim().ToUpperInvariant();
        if (!MenuFields.IsValidCurrency(currency))
        {
            throw new ValidationException("Currency must be a three-letter ISO 4217 code, e.g. EUR.")
            { Code = ErrorCodes.MenuCurrencyInvalid };
        }
        return currency;
    }

    // ── Audit ────────────────────────────────────────────────────────────────

    private void DescribeMenu(string action, Menu menu, string summary)
        => _audit.Describe(action, AuditTargets.Menu, AuditTargets.IdOf(menu.Id), menu.Name, menu.RestaurantId, summary);

    private void DescribeCategory(string action, MenuCategory category, int restaurantId, string summary)
        => _audit.Describe(action, AuditTargets.MenuCategory, AuditTargets.IdOf(category.Id), category.Name, restaurantId, summary);

    private void DescribeItem(string action, MenuItem item, int restaurantId, string summary)
        => _audit.Describe(action, AuditTargets.MenuItem, AuditTargets.IdOf(item.Id), item.Name, restaurantId, summary);

    // ── Mapping ──────────────────────────────────────────────────────────────

    private static MenuDto ToDto(Menu m) => new()
    {
        Id = m.Id,
        Name = m.Name,
        Description = m.Description,
        Currency = m.Currency,
        IsPublished = m.IsPublished,
        SortOrder = m.SortOrder,
        CreatedAt = m.CreatedAt,
        UpdatedAt = m.UpdatedAt,
        Categories = Ordered(m.Categories).Select(ToDto).ToList(),
    };

    private static MenuCategoryDto ToDto(MenuCategory c) => new()
    {
        Id = c.Id,
        Name = c.Name,
        Description = c.Description,
        SortOrder = c.SortOrder,
        IsVisible = c.IsVisible,
        Items = Ordered(c.Items).Select(ToDto).ToList(),
    };

    private static MenuItemDto ToDto(MenuItem i) => new()
    {
        Id = i.Id,
        Name = i.Name,
        Description = i.Description,
        PriceMinor = i.PriceMinor,
        ImageUrl = i.ImageUrl,
        Availability = MenuFields.ToName(i.Availability),
        Allergens = MenuFields.ToNames(i.Allergens),
        DietaryTags = MenuFields.ToNames(i.DietaryTags),
        SortOrder = i.SortOrder,
    };
}
