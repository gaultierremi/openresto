namespace OpenRestoApi.Core.Domain;

/// <summary>
/// Where a restaurant stands on the platform. Only <see cref="Published"/> is visible to guests;
/// <see cref="Draft"/> is a restaurant still being set up by its owner, <see cref="Suspended"/> one
/// the platform has switched off. Stored by name, so reordering this enum moves nothing.
/// </summary>
public enum RestaurantStatus
{
    Published,
    Draft,
    Suspended,
}

public static class RestaurantStatusExtensions
{
    public const int MaxLength = 16;
}
