using System.Text.Json;

namespace OpenRestoApi.Core.Domain;

/// <summary>
/// Reads and writes the two JSON columns of <see cref="RestaurantSite"/>. A column that does not
/// parse reads as empty rather than throwing: a page that cannot show its gallery must still open.
/// </summary>
public static class SiteContent
{
    public const int MaxPhotos = 6;

    /// <summary>The networks a site can link to, in the order the footer lists them.</summary>
    public static readonly IReadOnlyList<string> SocialKinds =
        ["Facebook", "Instagram", "TikTok", "X", "YouTube", "TripAdvisor", "LinkedIn"];

    private static readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);

    public static List<SitePhoto> ReadPhotos(string? json) => Read<SitePhoto>(json);

    public static List<SiteSocialLink> ReadSocialLinks(string? json) => Read<SiteSocialLink>(json);

    public static string? Write(IReadOnlyCollection<SitePhoto> photos)
        => photos.Count == 0 ? null : JsonSerializer.Serialize(photos, _json);

    public static string? Write(IReadOnlyCollection<SiteSocialLink> links)
        => links.Count == 0 ? null : JsonSerializer.Serialize(links, _json);

    private static List<T> Read<T>(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<T>>(json, _json)?.Where(e => e is not null).ToList() ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }
}
