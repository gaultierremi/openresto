namespace OpenRestoApi.Core.Domain;

/// <summary>
/// The platform's invitation to the person who will run a restaurant. The link carries a random
/// token that is stored only as a hash, so reading the table never reveals a usable link.
/// </summary>
public class RestaurantInvitation
{
    public int Id { get; set; }

    public int RestaurantId { get; set; }
    public Restaurant? Restaurant { get; set; }

    public string Email { get; set; } = null!;

    /// <summary>SHA-256 of the token, hex. See <see cref="InvitationToken"/>.</summary>
    public string TokenHash { get; set; } = null!;

    /// <summary>The language of the invitation mail, one of the UI locales.</summary>
    public string Locale { get; set; } = "fr";

    /// <summary>The platform user who sent it; a plain id, so the record outlives the account.</summary>
    public int? CreatedByUserId { get; set; }

    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public DateTime? AcceptedAt { get; set; }
    public int? AcceptedByUserId { get; set; }
    public DateTime? RevokedAt { get; set; }

    public InvitationState StateAt(DateTime nowUtc)
    {
        if (AcceptedAt is not null)
        {
            return InvitationState.Accepted;
        }

        if (RevokedAt is not null)
        {
            return InvitationState.Revoked;
        }

        return ExpiresAt <= nowUtc ? InvitationState.Expired : InvitationState.Pending;
    }
}

public enum InvitationState
{
    Pending,
    Accepted,
    Expired,
    Revoked,
}
