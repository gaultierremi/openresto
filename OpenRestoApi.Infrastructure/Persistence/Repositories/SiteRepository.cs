using CustomAccessibility.Attributes;
using Microsoft.EntityFrameworkCore;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Infrastructure.Persistence.Repositories;

[OnlyAccessibleBy("OpenRestoApi.Extensions.ServiceCollectionExtensions")]
[OnlyAccessibleBy("OpenRestoApi.Tests.Services.SiteServiceTests")]
[ExternalAccessAllowed]
internal class SiteRepository(AppDbContext db) : ISiteRepository
{
    private readonly AppDbContext _db = db;

    public async Task<Restaurant?> FindRestaurantAsync(int restaurantId)
        => await _db.Restaurants.FirstOrDefaultAsync(r => r.Id == restaurantId);

    public async Task<RestaurantSite?> FindByRestaurantAsync(int restaurantId)
        => await _db.RestaurantSites.FirstOrDefaultAsync(s => s.RestaurantId == restaurantId);

    public async Task<bool> IsSlugTakenAsync(string slug, int exceptRestaurantId)
        => await _db.RestaurantSites.AnyAsync(s => s.Slug == slug && s.RestaurantId != exceptRestaurantId);

    public async Task<RestaurantSite?> FindPublishedBySlugAsync(string slug)
        => await _db.RestaurantSites
            .Include(s => s.Restaurant)
            .FirstOrDefaultAsync(s => s.Slug == slug && s.IsPublished && !s.Restaurant!.IsArchived);

    public async Task<List<RestaurantSite>> GetPublishedAsync()
        => await _db.RestaurantSites
            .Where(s => s.IsPublished && !s.Restaurant!.IsArchived)
            .ToListAsync();

    public void Add(RestaurantSite site) => _db.RestaurantSites.Add(site);

    public async Task SaveChangesAsync() => await _db.SaveChangesAsync();
}
