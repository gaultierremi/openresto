namespace OpenRestoApi.Core.Application.Utilities;

/// <summary>
/// Stable, machine-readable identifiers for the specific rule that rejected a request. Surfaced
/// as <c>OpenRestoException.Code</c> and echoed on <c>MessageResponse.Code</c> alongside the
/// existing English <c>message</c> — the code is what a client branches on, the message is what
/// it shows. One constant per distinct rule, not per throw site: two throw sites rejecting for
/// the same reason share a code, even across different controllers or exception types.
/// </summary>
/// <remarks>
/// Does not cover the ~35 <c>[StringLength]</c>/<c>[Required]</c>-style <c>ErrorMessage</c>
/// values on request DTOs (e.g. <c>BrandRequest</c>). Model-state validation fails before a
/// controller action runs, so those never reach <c>GlobalExceptionHandler</c> — giving them a
/// code is a follow-up epic, not part of #375.
/// </remarks>
public static class ErrorCodes
{
    // ── Bookings ─────────────────────────────────────────────────────────────
    public const string BookingPastDate = "booking.past_date";
    public const string BookingPaused = "booking.paused";
    public const string BookingPausedIndefinitely = "booking.paused_indefinitely";
    public const string BookingWalkInOnly = "booking.walk_in_only";
    public const string BookingWalkInOnlyToday = "booking.walk_in_only_today";
    public const string BookingTableConflict = "booking.table_conflict";
    public const string BookingTableHeld = "booking.table_held";
    public const string BookingNoTablesAvailable = "booking.no_tables_available";
    public const string BookingAllTablesHeld = "booking.all_tables_held";
    public const string BookingAmbiguousTableSelection = "booking.ambiguous_table_selection";
    public const string BookingPartySizeOutOfRange = "booking.party_size_out_of_range";
    public const string BookingAlreadyPast = "booking.already_past";
    public const string BookingAlreadyActive = "booking.already_active";
    public const string BookingMoveConflict = "booking.move_conflict";
    public const string BookingTableNotInSection = "booking.table_not_in_section";
    public const string BookingInvalidTableForRestaurant = "booking.invalid_table_for_restaurant";
    public const string BookingSectionMismatch = "booking.section_mismatch";
    public const string BookingTableIdRequiredForSectionChange = "booking.table_id_required_for_section_change";
    public const string BookingEmailFieldsRequired = "booking.email_fields_required";
    public const string BookingReminderChannelInvalid = "booking.reminder_channel_invalid";
    public const string BookingReminderKeysRequired = "booking.reminder_keys_required";
    public const string BookingReminderEndpointInvalid = "booking.reminder_endpoint_invalid";
    public const string BookingReminderTooLate = "booking.reminder_too_late";
    public const string BookingReminderCancelled = "booking.reminder_cancelled";
    public const string BookingWalletNotConfigured = "booking.wallet_not_configured";
    public const string BookingWalletCancelled = "booking.wallet_cancelled";
    public const string BookingNoCustomerEmail = "booking.no_customer_email";
    public const string BookingEmailSendFailed = "booking.email_send_failed";
    public const string BookingLookupEmailRequired = "booking.lookup_email_required";
    public const string BookingLookupNotFound = "booking.lookup_not_found";
    public const string BookingCancelEmailRequired = "booking.cancel_email_required";
    public const string BookingStatusInvalid = "booking.status_invalid";
    public const string BookingStatusCancelled = "booking.status_cancelled";
    public const string BookingStatusTransitionInvalid = "booking.status_transition_invalid";
    public const string BookingNoShowBeforeStart = "booking.no_show_before_start";
    public const string BookingPacingFull = "booking.pacing_full";
    public const string BookingEmailInvalid = "booking.email_invalid";

    public const string TableSeatsExceeded = "table.seats_exceeded";
    public const string TableOversizeCap = "table.oversize_cap";
    public const string TableSeatsOutOfRange = "table.seats_out_of_range";
    public const string TableWalkInOnly = "table.walk_in_only";

    public const string TableGroupNotFound = "table_group.not_found";
    public const string TableGroupBookingConflict = "table_group.booking_conflict";
    public const string TableGroupHoldConflict = "table_group.hold_conflict";
    public const string TableGroupDisbanded = "table_group.disbanded";
    public const string TableGroupSeatsExceeded = "table_group.seats_exceeded";
    public const string TableGroupOversizeCap = "table_group.oversize_cap";
    public const string TableGroupNoMembers = "table_group.no_members";
    public const string TableGroupMinMembers = "table_group.min_members";
    public const string TableGroupDuplicateMember = "table_group.duplicate_member";
    public const string TableGroupInvalidMembers = "table_group.invalid_members";
    public const string TableGroupMemberAlreadyGrouped = "table_group.member_already_grouped";
    public const string TableGroupCombinedSeatsExceedsSum = "table_group.combined_seats_exceeds_sum";
    public const string TableGroupCombinedSeatsNotWorthCombining = "table_group.combined_seats_not_worth_combining";

    public const string HoldAmbiguousGroupAndTable = "hold.ambiguous_group_and_table";
    public const string HoldGroupSeatsRequired = "hold.group_seats_required";
    public const string HoldAutoAssignSeatsRequired = "hold.auto_assign_seats_required";
    public const string HoldUnavailable = "hold.unavailable";
    public const string HoldClientLimit = "hold.client_limit";

    // ── Locations ────────────────────────────────────────────────────────────
    public const string RestaurantNotFound = "restaurant.not_found";
    public const string RestaurantNoSections = "restaurant.no_sections";
    public const string RestaurantNameRequired = "restaurant.name_required";
    public const string RestaurantArchiveBeforeDelete = "restaurant.archive_before_delete";
    public const string RestaurantClosedAtTime = "restaurant.closed_at_time";
    public const string RestaurantDurationInvalid = "restaurant.duration_invalid";
    public const string RestaurantSlotIntervalInvalid = "restaurant.slot_interval_invalid";
    public const string RestaurantOversizeCapInvalid = "restaurant.oversize_cap_invalid";
    public const string RestaurantMaxCoversInvalid = "restaurant.max_covers_invalid";
    public const string RestaurantMenuUrlInvalid = "restaurant.menu_url_invalid";
    public const string RestaurantBookingRefFormatInvalid = "restaurant.booking_ref_format_invalid";
    public const string RestaurantWalkInDaysInvalid = "restaurant.walk_in_days_invalid";
    public const string RestaurantOpenHoursDayInvalid = "restaurant.open_hours_day_invalid";
    public const string RestaurantOpenHoursDuplicateDay = "restaurant.open_hours_duplicate_day";
    public const string RestaurantOpenHoursTimeInvalid = "restaurant.open_hours_time_invalid";
    public const string RestaurantSectionIdsMismatch = "restaurant.section_ids_mismatch";
    public const string RestaurantTurnTimeDuplicateSeats = "restaurant.turn_time_duplicate_seats";
    public const string RestaurantTurnTimeMinutesInvalid = "restaurant.turn_time_minutes_invalid";
    public const string RestaurantTurnTimeSeatsOutOfRange = "restaurant.turn_time_seats_out_of_range";

    // ── Waitlist ─────────────────────────────────────────────────────────────
    public const string WaitlistNotFound = "waitlist.not_found";
    public const string WaitlistNotWalkInNow = "waitlist.not_walk_in_now";
    public const string WaitlistClosedNow = "waitlist.closed_now";
    public const string WaitlistNameRequired = "waitlist.name_required";
    public const string WaitlistEmailInvalid = "waitlist.email_invalid";
    public const string WaitlistPartyTooLarge = "waitlist.party_too_large";
    public const string WaitlistNotActive = "waitlist.not_active";
    public const string WaitlistNoTableFree = "waitlist.no_table_free";
    public const string WaitlistPushInvalid = "waitlist.push_invalid";

    // ── Accounts ─────────────────────────────────────────────────────────────
    public const string UserEmailAlreadyExists = "user.email_already_exists";
    public const string UserCannotChangeOwnRole = "user.cannot_change_own_role";
    public const string UserCannotDeactivateSelf = "user.cannot_deactivate_self";
    public const string UserLastActiveOwnerDemote = "user.last_active_owner_demote";
    public const string UserLastActiveOwnerDeactivate = "user.last_active_owner_deactivate";
    public const string UserNotFound = "user.not_found";
    public const string UserEmailInvalid = "user.email_invalid";
    public const string UserEmailTooLong = "user.email_too_long";
    public const string UserDisplayNameTooLong = "user.display_name_too_long";
    public const string UserPasswordTooShort = "user.password_too_short";
    public const string UserRoleInvalid = "user.role_invalid";

    // ── API keys ─────────────────────────────────────────────────────────────
    public const string ApiKeyNameRequired = "api_key.name_required";
    public const string ApiKeyNameTooLong = "api_key.name_too_long";
    public const string ApiKeyScopesRequired = "api_key.scopes_required";
    public const string ApiKeyScopeInvalid = "api_key.scope_invalid";
    public const string ApiKeyExpiresAtInPast = "api_key.expires_at_in_past";
    public const string ApiKeyExpiresAtWithNeverExpires = "api_key.expires_at_with_never_expires";
    public const string ApiKeyNotFound = "api_key.not_found";
    public const string ApiKeyScopeMissing = "api_key.scope_missing";
    public const string ApiKeyNotAllowed = "api_key.not_allowed";
    public const string ApiKeyNotASession = "api_key.not_a_session";

    public const string AuthEmailUnchanged = "auth.email_unchanged";
    public const string AuthEmailAlreadyInUse = "auth.email_already_in_use";
    public const string AuthPvqFieldsRequired = "auth.pvq_fields_required";
    public const string AuthPvqNotConfigured = "auth.pvq_not_configured";
    public const string AuthInvalidResetToken = "auth.invalid_reset_token";
    public const string AuthNoAccountForSession = "auth.no_account_for_session";

    // ── Instance settings ────────────────────────────────────────────────────
    public const string BrandAppNameTooLong = "brand.app_name_too_long";
    public const string BrandPrimaryColorInvalid = "brand.primary_color_invalid";
    public const string BrandAccentColorInvalid = "brand.accent_color_invalid";
    public const string BrandFaviconInvalid = "brand.favicon_invalid";
    public const string BrandCopyrightTooLong = "brand.copyright_too_long";
    public const string BrandSubtitleTooLong = "brand.subtitle_too_long";
    public const string BrandHighlightsHeadingTooLong = "brand.highlights_heading_too_long";
    public const string BrandHighlightsSubheadingTooLong = "brand.highlights_subheading_too_long";
    public const string BrandHeaderImageFitInvalid = "brand.header_image_fit_invalid";
    public const string BrandWebsiteUrlInvalid = "brand.website_url_invalid";
    public const string BrandPrivacyPolicyUrlInvalid = "brand.privacy_policy_url_invalid";
    public const string BrandMinimumAppVersionInvalid = "brand.minimum_app_version_invalid";

    public const string HighlightTitleRequired = "highlight.title_required";
    public const string HighlightTitleTooLong = "highlight.title_too_long";
    public const string HighlightBodyTooLong = "highlight.body_too_long";
    public const string HighlightLinkInvalid = "highlight.link_invalid";

    public const string SocialLinkLabelRequired = "social_link.label_required";
    public const string SocialLinkLabelTooLong = "social_link.label_too_long";
    public const string SocialLinkUrlRequired = "social_link.url_required";
    public const string SocialLinkUrlInvalid = "social_link.url_invalid";

    /// <summary>Shared by highlights and social links: both validate an icon key against the same allow-list.</summary>
    public const string IconInvalid = "icon.invalid";

    public const string ContactPhoneTooLong = "contact.phone_too_long";
    public const string ContactEmailTooLong = "contact.email_too_long";
    public const string ContactEmailInvalid = "contact.email_invalid";

    // ── Menus ────────────────────────────────────────────────────────────────
    /// <summary>
    /// Shared by every menu lookup, admin and public alike: an unknown id, one belonging to
    /// another restaurant, and (publicly) an unknown token, an archived location or nothing
    /// published all answer with this, so the response says nothing about which it was.
    /// </summary>
    public const string MenuNotFound = "menu.not_found";
    public const string MenuNameRequired = "menu.name_required";
    public const string MenuNameTooLong = "menu.name_too_long";
    /// <summary>Shared by menus, categories and items: one cap, one rule.</summary>
    public const string MenuDescriptionTooLong = "menu.description_too_long";
    public const string MenuCurrencyInvalid = "menu.currency_invalid";
    public const string MenuCategoryNameRequired = "menu.category_name_required";
    public const string MenuCategoryNameTooLong = "menu.category_name_too_long";
    public const string MenuItemNameRequired = "menu.item_name_required";
    public const string MenuItemNameTooLong = "menu.item_name_too_long";
    public const string MenuPriceInvalid = "menu.price_invalid";
    public const string MenuAvailabilityInvalid = "menu.availability_invalid";
    public const string MenuAllergenInvalid = "menu.allergen_invalid";
    public const string MenuDietaryTagInvalid = "menu.dietary_tag_invalid";
    public const string MenuReorderIdsMismatch = "menu.reorder_ids_mismatch";
    public const string MenuItemImageTooLarge = "menu.item_image_too_large";

    // ── Sites ────────────────────────────────────────────────────────────────
    /// <summary>
    /// Shared by the admin lookup of a photo and the whole public side: an unknown or foreign photo,
    /// an unknown slug, an unpublished site and an archived location all answer with this.
    /// </summary>
    public const string SiteNotFound = "site.not_found";
    public const string SiteSlugInvalid = "site.slug_invalid";
    public const string SiteSlugTaken = "site.slug_taken";
    public const string SiteThemeInvalid = "site.theme_invalid";
    public const string SiteTaglineTooLong = "site.tagline_too_long";
    public const string SiteSocialInvalid = "site.social_invalid";
    public const string SiteSocialTooMany = "site.social_too_many";
    public const string SiteLegalTooLong = "site.legal_too_long";
    public const string SiteLegalInvalid = "site.legal_invalid";
    public const string SitePhotoAltRequired = "site.photo_alt_required";
    public const string SitePhotoAltTooLong = "site.photo_alt_too_long";
    public const string SitePhotosFull = "site.photos_full";
    public const string SiteReorderIdsMismatch = "site.reorder_ids_mismatch";
    public const string SiteImageTooLarge = "site.image_too_large";
    public const string SiteImageDimensionsTooLarge = "site.image_dimensions_too_large";
    public const string SiteImageUnreadable = "site.image_unreadable";
    public const string SiteNotPublishable = "site.not_publishable";
    public const string SiteLocationArchived = "site.location_archived";
    public const string SiteColorInvalid = "site.color_invalid";

    // ── Platform & onboarding ────────────────────────────────────────────────
    /// <summary>
    /// A restaurateur's lookup of a restaurant they are not a member of, an unknown id and an
    /// unusable invitation token all answer with this, so nothing says which it was.
    /// </summary>
    public const string PlatformNotFound = "platform.not_found";
    public const string PlatformInvitationInvalid = "platform.invitation_invalid";
    public const string PlatformInvitationEmailInvalid = "platform.invitation_email_invalid";
    public const string PlatformInvitationAlreadyAccepted = "platform.invitation_already_accepted";
    public const string PlatformRestaurantNameRequired = "platform.restaurant_name_required";
    public const string PlatformAccessReasonRequired = "platform.access_reason_required";
    public const string PlatformSuspendReasonTooLong = "platform.suspend_reason_too_long";
    public const string PlatformAlreadySuspended = "platform.already_suspended";
    public const string PlatformNotSuspended = "platform.not_suspended";
    public const string PlatformRetentionInvalid = "platform.retention_invalid";
    public const string OnboardingConsentRequired = "onboarding.consent_required";
    public const string OnboardingConsentOutdated = "onboarding.consent_outdated";
    public const string OnboardingSuspended = "onboarding.suspended";
    public const string OnboardingNotPublishable = "onboarding.not_publishable";
    public const string OnboardingStepUnknown = "onboarding.step_unknown";
    public const string OnboardingStepRequired = "onboarding.step_required";
    public const string OnboardingNameRequired = "onboarding.name_required";
    public const string OnboardingAddressRequired = "onboarding.address_required";
    public const string OnboardingPhoneRequired = "onboarding.phone_required";
    public const string OnboardingEmailRequired = "onboarding.email_required";
    public const string OnboardingLegalNameRequired = "onboarding.legal_name_required";
    public const string OnboardingCompanyNumberRequired = "onboarding.company_number_required";
    public const string OnboardingCompanyNumberInvalid = "onboarding.company_number_invalid";
    public const string OnboardingVatInvalid = "onboarding.vat_invalid";
    public const string OnboardingRetentionInvalid = "onboarding.retention_invalid";
    public const string OnboardingLayoutEmpty = "onboarding.layout_empty";
    public const string OnboardingLayoutInvalid = "onboarding.layout_invalid";
    public const string OnboardingHoursNoOpenDay = "onboarding.hours_no_open_day";
    public const string OnboardingLayoutInUse = "onboarding.layout_in_use";
    public const string OnboardingMenuInvalid = "onboarding.menu_invalid";
    public const string LegalDocumentNotFound = "legal.document_not_found";

    // ── Media ────────────────────────────────────────────────────────────────
    public const string MediaUnsupportedImageType = "media.unsupported_image_type";
    public const string MediaHeroTooLarge = "media.hero_too_large";
    public const string MediaLocationImageTooLarge = "media.location_image_too_large";
    public const string MediaUnsupportedMenuType = "media.unsupported_menu_type";
    public const string MediaMenuTooLarge = "media.menu_too_large";

    // ── Infrastructure ───────────────────────────────────────────────────────
    public const string EmailNotConfigured = "email.not_configured";
    public const string EmailConnectionFailed = "email.connection_failed";
    public const string AdminPasswordNotConfigured = "admin.password_not_configured";
    public const string NotificationPushEndpointInvalid = "notification.push_endpoint_invalid";
}
