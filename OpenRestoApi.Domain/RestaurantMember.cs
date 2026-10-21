namespace OpenRestoApi.Core.Domain;

/// <summary>
/// An account that runs a restaurant: the link the restaurateur's own endpoints check before they
/// touch anything. A restaurateur reaches exactly the restaurants they are a member of, and a
/// restaurant they are not a member of answers like one that does not exist.
/// </summary>
public class RestaurantMember
{
    public int Id { get; set; }

    public int UserId { get; set; }
    public AdminCredential? User { get; set; }

    public int RestaurantId { get; set; }
    public Restaurant? Restaurant { get; set; }

    public DateTime CreatedAt { get; set; }
}
