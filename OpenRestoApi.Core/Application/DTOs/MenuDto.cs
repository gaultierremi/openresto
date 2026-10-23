namespace OpenRestoApi.Core.Application.DTOs;

// ── Admin ────────────────────────────────────────────────────────────────────

public class MenuDto
{
    public int Id { get; set; }
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public string Currency { get; set; } = null!;
    public bool IsPublished { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public List<MenuCategoryDto> Categories { get; set; } = [];
}

public class MenuCategoryDto
{
    public int Id { get; set; }
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public int SortOrder { get; set; }
    public bool IsVisible { get; set; }
    public List<MenuItemDto> Items { get; set; } = [];
}

public class MenuItemDto
{
    public int Id { get; set; }
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public string PrimaryLanguage { get; set; } = "fr";
    public Dictionary<string, MenuItemTranslationDto> Translations { get; set; } = [];
    public long? PriceMinor { get; set; }
    public string? ImageUrl { get; set; }
    public string Availability { get; set; } = null!;
    public List<string> Allergens { get; set; } = [];
    public List<string> DietaryTags { get; set; } = [];
    public int SortOrder { get; set; }
}

/// <summary>Create and update share one shape. A blank or missing currency on create means EUR.</summary>
public class SaveMenuRequest
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public string? Currency { get; set; }
}

public class SaveMenuCategoryRequest
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public bool IsVisible { get; set; } = true;
}

public class SaveMenuItemRequest
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public string? PrimaryLanguage { get; set; }
    public Dictionary<string, MenuItemTranslationDto>? Translations { get; set; }

    /// <summary>Minor units (cents). Null means "price on request".</summary>
    public long? PriceMinor { get; set; }

    /// <summary><c>Available</c>, <c>SoldOut</c> or <c>Hidden</c>. Missing means <c>Available</c>.</summary>
    public string? Availability { get; set; }

    /// <summary>EU allergen names, e.g. <c>["Gluten","Milk"]</c>.</summary>
    public List<string>? Allergens { get; set; }

    /// <summary><c>Vegetarian</c>, <c>Vegan</c>, <c>GlutenFree</c>.</summary>
    public List<string>? DietaryTags { get; set; }
}

public class ReorderMenuEntriesRequest
{
    /// <summary>Every sibling's id, in the new order: no additions, removals or duplicates.</summary>
    public List<int> Ids { get; set; } = [];
}

public class MenuPublicTokensDto
{
    public string RestaurantToken { get; set; } = null!;
    public List<TablePublicTokenDto> Tables { get; set; } = [];
}

public class TablePublicTokenDto
{
    public int TableId { get; set; }
    public string? TableName { get; set; }
    public string SectionName { get; set; } = null!;
    public string Token { get; set; } = null!;
}

public class RegeneratedTokenDto
{
    public string Token { get; set; } = null!;
}

// ── Public ───────────────────────────────────────────────────────────────────
// No internal id (table, menu, category, item) appears in these shapes: the token in the URL is
// the only handle a guest is given on them. The restaurant's id is the one exception, because it
// is already public on the listing and is what the "Book a table" button needs to open that
// restaurant's own booking page instead of the whole list.

public class PublicMenuResponse
{
    public PublicMenuRestaurantDto Restaurant { get; set; } = null!;

    /// <summary>Set only when the menu was reached through a table's QR code.</summary>
    public PublicMenuTableDto? Table { get; set; }

    public List<PublicMenuDto> Menus { get; set; } = [];
}

public class PublicMenuRestaurantDto
{
    public int Id { get; set; }
    public string Name { get; set; } = null!;
    public string Timezone { get; set; } = null!;
}

public class PublicMenuTableDto
{
    public string? Name { get; set; }
}

public class PublicMenuDto
{
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public string Currency { get; set; } = null!;
    public List<PublicMenuCategoryDto> Categories { get; set; } = [];
}

public class PublicMenuCategoryDto
{
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public List<PublicMenuItemDto> Items { get; set; } = [];
}

public class PublicMenuItemDto
{
    public string ViewToken { get; set; } = null!;
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public string PrimaryLanguage { get; set; } = "fr";
    public Dictionary<string, MenuItemTranslationDto> Translations { get; set; } = [];
    public long? PriceMinor { get; set; }
    public string? ImageUrl { get; set; }

    /// <summary><c>Available</c> or <c>SoldOut</c>; hidden items are never listed.</summary>
    public string Availability { get; set; } = null!;
    public List<string> Allergens { get; set; } = [];
    public List<string> DietaryTags { get; set; } = [];
}

public class MenuItemTranslationDto
{
    public string? Name { get; set; }
    public string? Description { get; set; }
}
