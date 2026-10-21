namespace OpenRestoApi.Core.Domain;

/// <summary>
/// One document a restaurateur agreed to, at one version, at one moment. It is the platform's
/// proof of consent, so it carries a hash of the exact text shown and refers to the account and
/// the restaurant by plain ids: deleting either must not erase the evidence.
/// </summary>
public class LegalAcceptance
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public int RestaurantId { get; set; }

    /// <summary>The address the account was created with, as the proof names the person.</summary>
    public string Email { get; set; } = null!;

    /// <summary>One of <see cref="LegalDocumentKeys.All"/>.</summary>
    public string DocumentKey { get; set; } = null!;

    public string Version { get; set; } = null!;

    /// <summary>SHA-256 of the text the restaurateur was shown, hex.</summary>
    public string ContentSha256 { get; set; } = null!;

    public DateTime AcceptedAt { get; set; }
}

/// <summary>The documents a restaurateur must accept before the account exists.</summary>
public static class LegalDocumentKeys
{
    public const string Terms = "terms";
    public const string Privacy = "privacy";
    public const string Dpa = "dpa";
    public const string LegalNotice = "legal-notice";

    /// <summary>All four are published; only the first three are accepted at sign-up.</summary>
    public static readonly IReadOnlyList<string> All = [Terms, Privacy, Dpa, LegalNotice];

    public static readonly IReadOnlyList<string> AcceptedAtSignUp = [Terms, Privacy, Dpa];

    public const int MaxLength = 24;
    public const int MaxVersionLength = 16;
}
