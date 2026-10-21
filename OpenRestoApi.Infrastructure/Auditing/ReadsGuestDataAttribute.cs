namespace OpenRestoApi.Infrastructure.Auditing;

/// <summary>
/// Declares that a GET action hands guest identity (names, e-mail addresses) to an admin caller,
/// so a successful call lands a <c>guests.read</c> audit row: who, when, which location and which
/// screen, never what was read.
/// <para>
/// <see cref="Label"/> names the screen in the row and is also what repeated reads are grouped
/// by, so it must be stable. <see cref="RestaurantRouteKey"/> says where the location id
/// travels when it is not <c>restaurantId</c> (a route value or a query parameter).
/// </para>
/// <seealso>AuditCoverageTests.EveryAdminReadReturningAGuestType_DeclaresItself</seealso>
/// <seealso>AuditCoverageTests.TheDeclaredGuestDataReads_AreExactlyTheOnesListedHere</seealso>
/// <seealso>GuestDataReadAuditTests.ReadingGuestData_LandsOneRowNamingTheLocation</seealso>
/// </summary>
[AttributeUsage(AttributeTargets.Method, AllowMultiple = false)]
public sealed class ReadsGuestDataAttribute(string label) : Attribute
{
    public string Label { get; } = label;

    public string RestaurantRouteKey { get; init; } = "restaurantId";
}
