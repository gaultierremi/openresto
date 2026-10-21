using CustomAccessibility.Attributes;
using OpenRestoApi.Core.Application.Interfaces;
using OpenRestoApi.Core.Application.Services;
using OpenRestoApi.Core.Application.Utilities;
using OpenRestoApi.Core.Domain;
using OpenRestoApi.Infrastructure.Auth;

namespace OpenRestoApi.Infrastructure.Auditing;

/// <summary>
/// Writes the audit entry for a request once the rest of the pipeline has finished with it.
/// <para>
/// Position matters twice over. It sits <em>outside</em> <c>UseExceptionHandler</c>, so by the
/// time it runs a thrown <c>BusinessRuleException</c> has already been mapped and
/// <c>Response.StatusCode</c> is the 400 the caller actually received rather than the 200 it
/// still was inside MVC's filters. And it sits outside <c>UseForwardedHeaders</c>, so
/// <c>RemoteIpAddress</c> is the client's rather than nginx's.
/// </para>
/// <para>
/// The write goes through its own DI scope. Sharing the request's <c>DbContext</c> would mean
/// this <c>SaveChanges</c> flushing whatever a half-finished service left tracked on it —
/// committing, as a side effect of logging, the very mutation that threw.
/// </para>
/// </summary>
[OnlyAccessibleBy("OpenRestoApi.Infrastructure.Auditing.*")]
[OnlyAccessibleBy("OpenRestoApi.Tests.Infrastructure.AuditLogMiddlewareTests")]
[ExternalAccessAllowed]
internal sealed class AuditLogMiddleware(
    RequestDelegate next,
    IServiceScopeFactory scopeFactory,
    ILogger<AuditLogMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        await next(context);

        try
        {
            await RecordAsync(context);
        }
        catch (Exception ex)
        {
            // The response has already gone out; there is nothing to fail. Losing the entry is
            // bad, so it is logged loudly rather than swallowed.
            //
            // Named by its endpoint rather than its URL. The request method and path are
            // caller-supplied — Kestrel percent-decodes %0A straight into Request.Path — and a
            // log line assembled from them can be made to forge a second line. The endpoint's
            // display name comes from the routing table instead, so there is nothing to sanitize,
            // and "which action failed to record" is the more useful thing to read anyway.
            logger.LogError(ex, "[Audit] Failed to record an entry for {Endpoint}",
                context.GetEndpoint()?.DisplayName ?? "an unrouted request");
        }
    }

    /// <summary>
    /// How long a read of the same guest data by the same person stays one row. A dashboard that
    /// polls its notifications would otherwise write one row a minute; this keeps the answer to
    /// "who looked at this location's guests, and when" readable without losing either fact.
    /// </summary>
    public static readonly TimeSpan GuestDataReadWindow = TimeSpan.FromMinutes(10);

    /// <summary>
    /// Reads leave without resolving anything unless the endpoint declares that it returns guest
    /// identity (<see cref="ReadsGuestDataAttribute"/>); the overwhelming majority of requests
    /// are reads and take that early exit.
    /// <seealso>AuditTrailTests.ReadRequest_LandsNoEntry</seealso>
    /// <seealso>AuditTrailTests.MutatingAdminRequest_LandsAnEntryCarryingTheActorAndTheHttpFacts</seealso>
    /// </summary>
    private async Task RecordAsync(HttpContext context)
    {
        if (!AuditRequestClassifier.IsMutatingMethod(context.Request.Method))
        {
            await RecordGuestDataReadAsync(context);
            return;
        }

        AuditScope? scope = context.RequestServices.GetService<AuditScope>();
        if (scope is null) return;

        if (!scope.IsDescribed && !AuditRequestClassifier.IsAuditableAdminRequest(context)) return;

        await using AsyncServiceScope writeScope = scopeFactory.CreateAsyncScope();
        var repository = writeScope.ServiceProvider.GetRequiredService<IAdminAuditRepository>();
        var clock = writeScope.ServiceProvider.GetRequiredService<ISystemClock>();

        AuditActor actor = await ResolveActorAsync(context, scope, writeScope.ServiceProvider);

        await repository.AddAsync(Build(context, scope, actor, clock.UtcNow));
    }

    /// <summary>
    /// A successful read of an endpoint declared <see cref="ReadsGuestDataAttribute"/> lands a
    /// <c>guests.read</c> row naming who, which screen and which location, never what was read.
    /// A refused or failed read lands nothing: nothing was handed over.
    /// <seealso>GuestDataReadAuditTests.ReadingGuestData_LandsOneRowNamingTheLocation</seealso>
    /// <seealso>GuestDataReadAuditTests.RepeatedReads_WithinTheWindow_LandOneRow</seealso>
    /// <seealso>GuestDataReadAuditTests.ARefusedRead_LandsNoRow</seealso>
    /// </summary>
    private async Task RecordGuestDataReadAsync(HttpContext context)
    {
        ReadsGuestDataAttribute? declared = context.GetEndpoint()?.Metadata.GetMetadata<ReadsGuestDataAttribute>();
        if (declared is null) return;
        if (context.User?.Identity?.IsAuthenticated != true) return;
        if (context.Response.StatusCode is < 200 or >= 300) return;

        AuditScope? scope = context.RequestServices.GetService<AuditScope>();
        if (scope is null) return;

        int? restaurantId = scope.RestaurantId ?? RestaurantIdOf(context, declared.RestaurantRouteKey);

        await using AsyncServiceScope writeScope = scopeFactory.CreateAsyncScope();
        var repository = writeScope.ServiceProvider.GetRequiredService<IAdminAuditRepository>();
        var clock = writeScope.ServiceProvider.GetRequiredService<ISystemClock>();

        AuditActor actor = await ResolveActorAsync(context, scope, writeScope.ServiceProvider);
        DateTime now = clock.UtcNow;

        // The credential is part of "who": a read through an API key names the key, and must not
        // be swallowed by the same person's browser session having read the same screen a minute
        // ago.
        string? displayName = AuditFields.Sanitize(actor.DisplayName, AuditFields.MaxActorDisplayNameLength);
        if (await repository.ExistsSinceAsync(
                actor.UserId, actor.Email, displayName, AuditActions.GuestDataRead, declared.Label, restaurantId, now - GuestDataReadWindow))
        {
            return;
        }

        AdminAuditEntry entry = Build(context, scope, actor, now);
        entry.Action = AuditActions.GuestDataRead;
        entry.TargetType = AuditTargets.GuestData;
        entry.TargetId = null;
        entry.TargetLabel = AuditFields.Sanitize(declared.Label, AuditFields.MaxTargetLabelLength);
        entry.RestaurantId = restaurantId;
        entry.Summary = AuditFields.Sanitize(
            $"Read guest data: {declared.Label}{(restaurantId is null ? " (all locations)" : string.Empty)}",
            AuditFields.MaxSummaryLength);
        entry.ChangesJson = null;

        await repository.AddAsync(entry);
    }

    /// <summary>
    /// The location the way the action's own binder reads it: a route value as it is, else the
    /// <em>first</em> query value (a repeated parameter binds its first, so joining them would
    /// name "all locations" for a read that was in fact scoped to one), parsed as an integer.
    /// <seealso>GuestDataReadAuditTests.ARepeatedLocationParameter_IsAttributedToTheOneTheActionBound</seealso>
    /// </summary>
    private static int? RestaurantIdOf(HttpContext context, string key)
    {
        string? raw = context.Request.RouteValues.TryGetValue(key, out object? route)
            ? route?.ToString()
            : context.Request.Query[key].FirstOrDefault();
        return int.TryParse(raw, System.Globalization.NumberStyles.Integer, System.Globalization.CultureInfo.InvariantCulture, out int id) && id > 0
            ? id
            : null;
    }

    private sealed record AuditActor(int? UserId, string Email, string? DisplayName, string Role);

    /// <summary>
    /// The claims are the default, an explicit <c>AttributeTo</c> wins, and the display name is
    /// filled from the account row — it is the one thing the token doesn't carry, and an entry
    /// listing a bare address for someone the rest of the admin shows by name reads as a
    /// different person.
    /// </summary>
    private static async Task<AuditActor> ResolveActorAsync(
        HttpContext context, AuditScope scope, IServiceProvider writeScopeServices)
    {
        int? userId;
        string? email;
        string? displayName = scope.ActorDisplayName;
        string? role;

        if (scope.HasExplicitActor)
        {
            userId = scope.ActorUserId;
            email = scope.ActorEmail;
            role = scope.ActorRole;
        }
        else
        {
            ICurrentUserService? currentUser = context.RequestServices.GetService<ICurrentUserService>();
            userId = currentUser?.UserId;
            email = currentUser?.Email;
            role = currentUser?.Role;
        }

        if (displayName is null && userId.HasValue)
        {
            var credentials = writeScopeServices.GetRequiredService<IAdminCredentialRepository>();
            AdminCredential? account = await credentials.GetByIdAsync(userId.Value);
            displayName = account?.DisplayName;
            email ??= account?.Email;
            role ??= account?.Role;
        }

        // An API-key request acts as the underlying user, but "who" isn't the whole story for a
        // headless caller — "which key" is the point of the key's Name field (issue #319), so it
        // rides along on the same display-name slot rather than adding a column.
        string? apiKeyName = context.User.FindFirst(ApiKeyClaimTypes.KeyName)?.Value;
        if (!string.IsNullOrEmpty(apiKeyName))
        {
            displayName = $"{displayName ?? email ?? "?"} (API key \"{apiKeyName}\")";
        }

        return new AuditActor(userId, email ?? string.Empty, displayName, role ?? string.Empty);
    }

    private static AdminAuditEntry Build(
        HttpContext context, AuditScope scope, AuditActor actor, DateTime occurredAt) => new()
        {
            OccurredAt = occurredAt,
            ActorUserId = actor.UserId,
            ActorEmail = AuditFields.Sanitize(actor.Email, AuditFields.MaxActorEmailLength)!,
            ActorDisplayName = AuditFields.Sanitize(actor.DisplayName, AuditFields.MaxActorDisplayNameLength),
            ActorRole = AuditFields.Sanitize(actor.Role, AuditFields.MaxRoleLength)!,
            Action = AuditFields.Sanitize(
            scope.Action ?? AuditActions.ForUndescribedRequest(context.Request.Method),
            AuditFields.MaxActionLength)!,
            TargetType = AuditFields.Sanitize(scope.TargetType, AuditFields.MaxTargetTypeLength),
            TargetId = AuditFields.Sanitize(scope.TargetId, AuditFields.MaxTargetIdLength),
            TargetLabel = AuditFields.Sanitize(scope.TargetLabel, AuditFields.MaxTargetLabelLength),
            RestaurantId = scope.RestaurantId,
            Summary = AuditFields.Sanitize(scope.Summary, AuditFields.MaxSummaryLength),
            ChangesJson = scope.ChangesJson(),
            HttpMethod = AuditFields.Sanitize(context.Request.Method, AuditFields.MaxHttpMethodLength)!,
            // Path only. Admin list screens filter by customer email through the query string, and
            // an audit row is not allowed to hold customer PII.
            Path = AuditFields.Sanitize(context.Request.Path.Value ?? string.Empty, AuditFields.MaxPathLength)!,
            StatusCode = context.Response.StatusCode,
            IpAddress = AuditFields.Sanitize(
            context.Connection.RemoteIpAddress?.ToString(), AuditFields.MaxIpAddressLength),
            UserAgent = AuditFields.Sanitize(
            context.Request.Headers.UserAgent.ToString() is { Length: > 0 } ua ? ua : null,
            AuditFields.MaxUserAgentLength),
        };
}

/// <summary>Registers <see cref="AuditLogMiddleware"/>; see that type for why order matters.</summary>
public static class AuditingApplicationBuilderExtensions
{
    public static IApplicationBuilder UseAdminAuditLog(this IApplicationBuilder app)
        => app.UseMiddleware<AuditLogMiddleware>();
}
