using Microsoft.AspNetCore.Mvc;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Utilities;

namespace OpenRestoApi.Extensions;

public static class GuestDataReadExtensions
{
    /// <summary>
    /// Tells the audit row of a <c>[ReadsGuestData]</c> action which location the guest belongs
    /// to, for the reads that name a record (a booking id) rather than a location.
    /// </summary>
    public static void NoteGuestDataLocation(this ControllerBase controller, int restaurantId)
        => controller.HttpContext.RequestServices.GetService<IAuditScope>()
            ?.Describe(AuditActions.GuestDataRead, AuditTargets.GuestData, restaurantId: restaurantId);
}
