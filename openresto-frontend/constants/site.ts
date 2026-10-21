/** Mirrors the backend's `SiteFields`, `SiteContent` and `SiteTheme`. The server is the authority. */

export const SITE_THEMES = ["Brasserie", "Gastronomique", "Cafe"] as const;
export type SiteTheme = (typeof SITE_THEMES)[number];

export const SOCIAL_KINDS = [
  "Facebook",
  "Instagram",
  "TikTok",
  "X",
  "YouTube",
  "TripAdvisor",
  "LinkedIn",
] as const;
export type SocialKind = (typeof SOCIAL_KINDS)[number];

export const MAX_TAGLINE_LENGTH = 160;
export const MAX_ALT_LENGTH = 140;
export const MAX_LEGAL_NAME_LENGTH = 120;
export const MAX_COMPANY_NUMBER_LENGTH = 20;
export const MAX_VAT_NUMBER_LENGTH = 20;
export const MAX_LEGAL_ADDRESS_LENGTH = 200;
export const MAX_SOCIAL_URL_LENGTH = 500;

export const MAX_PHOTOS = 6;
export const RECOMMENDED_MIN_PHOTOS = 3;

export const SITE_IMAGE_MAX_BYTES = 6 * 1024 * 1024;
export const SITE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const PUBLIC_PATH_PREFIX = "/r/";

/** What the server names as standing between a site and its publication. */
export const MISSING_FIELDS = [
  "legal.name",
  "legal.companyNumber",
  "contact.email",
  "instance.publicUrl",
] as const;
export type MissingField = (typeof MISSING_FIELDS)[number];
