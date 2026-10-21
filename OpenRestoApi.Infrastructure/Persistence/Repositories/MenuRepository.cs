using CustomAccessibility.Attributes;
using Microsoft.EntityFrameworkCore;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Infrastructure.Persistence.Repositories;

[OnlyAccessibleBy("OpenRestoApi.Extensions.ServiceCollectionExtensions")]
[OnlyAccessibleBy("OpenRestoApi.Tests.Services.MenuServiceTests")]
[OnlyAccessibleBy("OpenRestoApi.Tests.Services.SiteServiceTests")]
[ExternalAccessAllowed]
internal class MenuRepository(AppDbContext db) : IMenuRepository
{
    private readonly AppDbContext _db = db;

    public async Task<Restaurant?> FindRestaurantAsync(int restaurantId)
        => await _db.Restaurants.FirstOrDefaultAsync(r => r.Id == restaurantId);

    public async Task<List<Menu>> GetMenusWithContentAsync(int restaurantId)
        => await WithContent()
            .Where(m => m.RestaurantId == restaurantId)
            .ToListAsync();

    public async Task<Menu?> FindMenuAsync(int restaurantId, int menuId)
        => await WithContent()
            .FirstOrDefaultAsync(m => m.Id == menuId && m.RestaurantId == restaurantId);

    public async Task<MenuCategory?> FindCategoryAsync(int restaurantId, int categoryId)
        => await _db.MenuCategories
            .Include(c => c.Menu)
            .Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.Id == categoryId && c.Menu!.RestaurantId == restaurantId);

    public async Task<MenuItem?> FindItemAsync(int restaurantId, int itemId)
        => await _db.MenuItems
            .Include(i => i.Category)
                .ThenInclude(c => c!.Menu)
            .FirstOrDefaultAsync(i => i.Id == itemId && i.Category!.Menu!.RestaurantId == restaurantId);

    public async Task<Restaurant?> FindRestaurantByTokenAsync(string token)
        => await _db.Restaurants.FirstOrDefaultAsync(r => r.PublicToken == token);

    public async Task<Table?> FindTableByTokenAsync(string token)
        => await _db.Tables
            .Include(t => t.Section)
                .ThenInclude(s => s!.Restaurant)
            .FirstOrDefaultAsync(t => t.PublicToken == token);

    public async Task<Table?> FindTableAsync(int restaurantId, int tableId)
        => await _db.Tables
            .Include(t => t.Section)
            .FirstOrDefaultAsync(t => t.Id == tableId && t.Section!.RestaurantId == restaurantId);

    public async Task<List<Table>> GetTablesAsync(int restaurantId)
        => await _db.Tables
            .Include(t => t.Section)
            .Where(t => t.Section!.RestaurantId == restaurantId)
            .ToListAsync();

    public void Add(Menu menu) => _db.Menus.Add(menu);
    public void Add(MenuCategory category) => _db.MenuCategories.Add(category);
    public void Add(MenuItem item) => _db.MenuItems.Add(item);
    public void Remove(Menu menu) => _db.Menus.Remove(menu);
    public void Remove(MenuCategory category) => _db.MenuCategories.Remove(category);
    public void Remove(MenuItem item) => _db.MenuItems.Remove(item);

    public async Task SaveChangesAsync() => await _db.SaveChangesAsync();

    private IQueryable<Menu> WithContent()
        => _db.Menus
            .Include(m => m.Categories)
                .ThenInclude(c => c.Items)
            .AsSplitQuery();
}
