using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Interfaces;

/// <summary>
/// Persistence of the one-page sites. Admin lookups take the restaurant id from the route; the
/// public ones take only a slug, and see only a site that is published on a location that is not
/// archived.
/// </summary>
public interface ISiteRepository
{
    Task<Restaurant?> FindRestaurantAsync(int restaurantId);

    Task<RestaurantSite?> FindByRestaurantAsync(int restaurantId);

    /// <summary>True when another location's site already uses the slug.</summary>
    Task<bool> IsSlugTakenAsync(string slug, int exceptRestaurantId);

    /// <summary>The live site at the slug, with its restaurant loaded; null when unpublished, archived or unknown.</summary>
    Task<RestaurantSite?> FindPublishedBySlugAsync(string slug);

    /// <summary>Every live site, for the sitemap.</summary>
    Task<List<RestaurantSite>> GetPublishedAsync();

    void Add(RestaurantSite site);

    Task SaveChangesAsync();
}
