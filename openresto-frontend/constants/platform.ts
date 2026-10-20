/** Mirrors `PlatformFields` (OpenRestoApi.Domain): the server holds the same limits. */
export const MIN_ACCESS_REASON_LENGTH = 10;
export const MAX_ACCESS_REASON_LENGTH = 300;
export const MAX_SUSPENSION_REASON_LENGTH = 300;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_RESTAURANT_NAME_LENGTH = 100;

/** `PlatformRestaurantDto.Status`. */
export type PlatformStatus = "Draft" | "Published" | "Suspended";

/** `PlatformInvitationDto.State`. */
export type InvitationState = "Pending" | "Accepted" | "Expired" | "Revoked";

/** The languages an invitation e-mail is written in, French first as the server's default. */
export const INVITATION_LOCALES = ["fr", "nl", "en"] as const;
export type InvitationLocale = (typeof INVITATION_LOCALES)[number];

/** The four documents `GET /api/legal` serves, in the order the index lists them. */
export const LEGAL_DOCUMENT_KEYS = ["terms", "privacy", "dpa", "legal-notice"] as const;
export type LegalDocumentKey = (typeof LEGAL_DOCUMENT_KEYS)[number];

/** `ErrorCodes.LegalDocumentNotFound`: the one refusal that means "no such document". */
export const LEGAL_NOT_FOUND_CODE = "legal.document_not_found";
