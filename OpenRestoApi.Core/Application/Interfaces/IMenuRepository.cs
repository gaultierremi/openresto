using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Interfaces;

/// <summary>
/// Persistence of menus, their categories and items, and the public tokens that reach them.
/// Every admin lookup takes the restaurant id from the URL and only matches a row that belongs
/// to it, so an id from another restaurant reads exactly like an id that does not exist.
/// </summary>
public interface IMenuRepository
{
    Task<Restaurant?> FindRestaurantAsync(int restaurantId);

    /// <summary>The restaurant's menus with categories and items loaded, unordered.</summary>
    Task<List<Menu>> GetMenusWithContentAsync(int restaurantId);

    /// <summary>The menu, with categories and items loaded, when it belongs to the restaurant.</summary>
    Task<Menu?> FindMenuAsync(int restaurantId, int menuId);

    /// <summary>The category, with its menu and items loaded, when it belongs to the restaurant.</summary>
    Task<MenuCategory?> FindCategoryAsync(int restaurantId, int categoryId);

    /// <summary>The item, with its category and menu loaded, when it belongs to the restaurant.</summary>
    Task<MenuItem?> FindItemAsync(int restaurantId, int itemId);

    Task<Restaurant?> FindRestaurantByTokenAsync(string token);

    /// <summary>The table with its section and restaurant loaded.</summary>
    Task<Table?> FindTableByTokenAsync(string token);

    /// <summary>The table, with its section loaded, when it belongs to the restaurant.</summary>
    Task<Table?> FindTableAsync(int restaurantId, int tableId);

    /// <summary>The restaurant's tables with their sections loaded.</summary>
    Task<List<Table>> GetTablesAsync(int restaurantId);

    void Add(Menu menu);
    void Add(MenuCategory category);
    void Add(MenuItem item);
    void Remove(Menu menu);
    void Remove(MenuCategory category);
    void Remove(MenuItem item);

    Task SaveChangesAsync();
}
