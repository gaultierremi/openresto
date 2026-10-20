using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Tests.Domain;

public class RestaurantInvitationTests
{
    private static readonly DateTime Now = new(2026, 10, 20, 12, 0, 0, DateTimeKind.Utc);

    private static RestaurantInvitation Invitation(
        DateTime? expiresAt = null, DateTime? acceptedAt = null, DateTime? revokedAt = null)
        => new()
        {
            Id = 1,
            RestaurantId = 1,
            Email = "owner@example.be",
            TokenHash = InvitationToken.Hash("t"),
            CreatedAt = Now.AddDays(-1),
            ExpiresAt = expiresAt ?? Now.AddDays(6),
            AcceptedAt = acceptedAt,
            RevokedAt = revokedAt,
        };

    [Fact]
    public void StateAt_IsPending_BeforeItExpires()
        => Assert.Equal(InvitationState.Pending, Invitation().StateAt(Now));

    [Fact]
    public void StateAt_IsPending_OneTickBeforeExpiry()
        => Assert.Equal(InvitationState.Pending, Invitation(expiresAt: Now.AddTicks(1)).StateAt(Now));

    [Fact]
    public void StateAt_IsExpired_AtTheExactExpiryInstant()
        => Assert.Equal(InvitationState.Expired, Invitation(expiresAt: Now).StateAt(Now));

    [Fact]
    public void StateAt_IsExpired_AfterExpiry()
        => Assert.Equal(InvitationState.Expired, Invitation(expiresAt: Now.AddTicks(-1)).StateAt(Now));

    [Fact]
    public void StateAt_IsAccepted_OnceAccepted()
        => Assert.Equal(InvitationState.Accepted, Invitation(acceptedAt: Now.AddHours(-1)).StateAt(Now));

    [Fact]
    public void StateAt_IsRevoked_OnceRevoked()
        => Assert.Equal(InvitationState.Revoked, Invitation(revokedAt: Now.AddHours(-1)).StateAt(Now));

    [Fact]
    public void StateAt_RevokedWinsOverExpired()
        => Assert.Equal(InvitationState.Revoked,
            Invitation(expiresAt: Now.AddDays(-1), revokedAt: Now.AddDays(-2)).StateAt(Now));

    [Fact]
    public void StateAt_AcceptedWinsOverExpired()
        => Assert.Equal(InvitationState.Accepted,
            Invitation(expiresAt: Now.AddDays(-1), acceptedAt: Now.AddDays(-2)).StateAt(Now));

    [Fact]
    public void StateAt_AcceptedWinsOverRevoked()
        => Assert.Equal(InvitationState.Accepted,
            Invitation(acceptedAt: Now.AddDays(-2), revokedAt: Now.AddDays(-1)).StateAt(Now));

    [Fact]
    public void StateAt_AcceptedWinsOverRevokedAndExpired()
        => Assert.Equal(InvitationState.Accepted,
            Invitation(expiresAt: Now.AddDays(-1), acceptedAt: Now.AddDays(-3), revokedAt: Now.AddDays(-2)).StateAt(Now));
}
