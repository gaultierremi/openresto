namespace OpenRestoApi.Core.Domain;

/// <summary>A restaurant's menu ("Lunch", "Drinks"). Guests only ever see a published one.</summary>
public class Menu
{
    public const string DefaultCurrency = "EUR";

    public int Id { get; set; }

    public int RestaurantId { get; set; }
    public Restaurant? Restaurant { get; set; }

    public string Name { get; set; } = null!;
    public string? Description { get; set; }

    /// <summary>ISO 4217 code, three upper-case letters. Every price on the menu is in it.</summary>
    public string Currency { get; set; } = DefaultCurrency;

    public bool IsPublished { get; set; }
    public int SortOrder { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public ICollection<MenuCategory> Categories { get; set; } = new List<MenuCategory>();
}

public class MenuCategory
{
    public int Id { get; set; }

    public int MenuId { get; set; }
    public Menu? Menu { get; set; }

    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public int SortOrder { get; set; }
    public bool IsVisible { get; set; } = true;

    public ICollection<MenuItem> Items { get; set; } = new List<MenuItem>();
}

public class MenuItem
{
    public int Id { get; set; }

    public int CategoryId { get; set; }
    public MenuCategory? Category { get; set; }

    public string Name { get; set; } = null!;
    public string? Description { get; set; }

    /// <summary>
    /// Price in the menu currency's minor unit (cents for EUR). Null means "price on request",
    /// which is not the same as free: a free item is 0.
    /// </summary>
    public long? PriceMinor { get; set; }

    /// <summary>Set only by the photo upload, under a random <c>dish-{token}</c> name rather than the item's id, since guests see this URL.</summary>
    public string? ImageUrl { get; set; }

    public MenuItemAvailability Availability { get; set; } = MenuItemAvailability.Available;
    public Allergens Allergens { get; set; }
    public DietaryTags DietaryTags { get; set; }
    public int SortOrder { get; set; }
}

/// <summary>
/// <see cref="SoldOut"/> stays on the public menu, marked; <see cref="Hidden"/> is left out of it.
/// </summary>
public enum MenuItemAvailability
{
    Available,
    SoldOut,
    Hidden,
}

/// <summary>The fourteen allergens EU Regulation 1169/2011 (Annex II) requires a menu to declare.</summary>
[Flags]
public enum Allergens
{
    None = 0,
    Gluten = 1 << 0,
    Crustaceans = 1 << 1,
    Eggs = 1 << 2,
    Fish = 1 << 3,
    Peanuts = 1 << 4,
    Soybeans = 1 << 5,
    Milk = 1 << 6,
    Nuts = 1 << 7,
    Celery = 1 << 8,
    Mustard = 1 << 9,
    Sesame = 1 << 10,
    Sulphites = 1 << 11,
    Lupin = 1 << 12,
    Molluscs = 1 << 13,
}

[Flags]
public enum DietaryTags
{
    None = 0,
    Vegetarian = 1 << 0,
    Vegan = 1 << 1,
    GlutenFree = 1 << 2,
}
