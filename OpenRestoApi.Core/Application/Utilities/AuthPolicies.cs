namespace OpenRestoApi.Core.Application.Utilities;

/// <summary>
/// Named authorization policies. Controllers gate on these constants rather than raw role
/// strings, so the role → capability mapping lives in exactly one place
/// (<c>ServiceCollectionExtensions.AddCustomAuthentication</c>). Introducing a role, or
/// swapping roles for fine-grained permission claims later, is a change to the policy
/// definitions only — no controller sweep.
/// </summary>
public static class AuthPolicies
{
    /// <summary>Any signed-in admin user (Owner or Manager).</summary>
    public const string RequireAdmin = "RequireAdmin";

    /// <summary>Owner-only capabilities — currently user management.</summary>
    public const string RequireOwner = "RequireOwner";

    /// <summary>
    /// The platform's own space: the restaurants list, suspension, invitations. Today the same
    /// people as <see cref="RequireOwner"/>, kept as its own name so the two can part ways.
    /// </summary>
    public const string RequirePlatform = "RequirePlatform";

    /// <summary>
    /// A restaurateur: the account an invitation creates. Deliberately not an admin — it never
    /// satisfies <see cref="RequireAdmin"/>, so none of the admin endpoints are reachable with it.
    /// </summary>
    public const string RequireRestaurateur = "RequireRestaurateur";
}
