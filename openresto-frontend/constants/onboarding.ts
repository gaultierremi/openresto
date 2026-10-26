/** Mirrors the backend's onboarding steps and field caps (`OnboardingProgress`, `OnboardingFields`). The server is the authority. */

export const STEP_KEYS = ["info", "hours", "layout", "menu", "branding"] as const;
export type StepKey = (typeof STEP_KEYS)[number];

/** The sixth stage of the assistant: nothing is saved there, the restaurateur looks and publishes. */
export const PREVIEW_STAGE = "preview";
export type Stage = StepKey | typeof PREVIEW_STAGE;

export const STAGES: readonly Stage[] = [...STEP_KEYS, PREVIEW_STAGE];

export type StepState = "Todo" | "Done" | "Skipped";
export type RestaurantStatus = "Draft" | "Published" | "Suspended";

export const MIN_PASSWORD_LENGTH = 10;

/** The documents a restaurateur accepts at sign-up, as the invitation preview names them. */
export const LEGAL_DOCUMENT_KEYS = ["terms", "privacy", "dpa"] as const;
export type LegalDocumentKey = (typeof LEGAL_DOCUMENT_KEYS)[number];
export const legalPath = (key: string) => `/legal/${encodeURIComponent(key)}`;

export const MIN_RETENTION_MONTHS = 1;
export const MAX_RETENTION_MONTHS = 60;
export const DEFAULT_RETENTION_MONTHS = 12;

export const MAX_NAME_LENGTH = 100;
export const MAX_ADDRESS_LENGTH = 250;
export const MAX_PHONE_LENGTH = 30;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_LEGAL_NAME_LENGTH = 150;
export const MAX_COMPANY_NUMBER_LENGTH = 20;
export const MAX_VAT_LENGTH = 20;
export const MAX_DISPLAY_NAME_LENGTH = 100;

/** ISO 8601 day numbers, Monday first. */
export const ISO_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const DEFAULT_OPEN_TIME = "09:00";
export const DEFAULT_CLOSE_TIME = "22:00";

/** `BookingDuration.AllowedMinutes`: the sitting lengths the server accepts. */
export const ALLOWED_BOOKING_DURATIONS = [30, 60, 90, 120, 150, 180, 240, 300, 360, 420, 480];
export const DEFAULT_BOOKING_DURATION = 90;

export const MAX_SECTION_NAME_LENGTH = 60;
export const MAX_TABLE_NAME_LENGTH = 40;
export const MIN_SEATS = 1;
export const MAX_SEATS = 50;
export const DEFAULT_TABLE_SEATS = 2;

export const MAX_MENU_NAME_LENGTH = 80;
export const MAX_CATEGORY_NAME_LENGTH = 80;
export const MAX_DISH_NAME_LENGTH = 80;
export const MAX_DISH_DESCRIPTION_LENGTH = 300;
export const MENU_CURRENCY = "EUR";

export const MAX_TAGLINE_LENGTH = 140;
/** A few colours that read well on the three themes; the hex field takes any other. */
export const COLOR_PRESETS = [
  "#b45309",
  "#9f1239",
  "#166534",
  "#1d4ed8",
  "#6d28d9",
  "#0f766e",
  "#111827",
] as const;
