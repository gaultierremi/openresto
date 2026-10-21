using OpenRestoApi.Core.Application.DTOs;
using OpenRestoApi.Core.Domain;

namespace OpenRestoApi.Core.Application.Interfaces;

/// <summary>
/// Append, read and prune. There is deliberately no update and no single-row delete: the only
/// path that removes an entry is the retention pass, which drops whole date ranges.
/// </summary>
public interface IAdminAuditRepository
{
    Task AddAsync(AdminAuditEntry entry);

    /// <summary>
    /// Whether this actor already has a row for the same action, screen and location since
    /// <paramref name="sinceUtc"/>. A read of guest data is recorded once per such window rather
    /// than once per poll, so the list stays something a person can read.
    /// </summary>
    Task<bool> ExistsSinceAsync(
        int? actorUserId, string actorEmail, string action, string? targetLabel, int? restaurantId, DateTime sinceUtc);

    Task<(List<AdminAuditEntry> Items, int TotalCount)> QueryPagedAsync(AuditQuery query, int page, int pageSize);

    /// <summary>Returns how many rows were dropped, for the retention pass to log.</summary>
    Task<int> DeleteOlderThanAsync(DateTime cutoffUtc);
}
