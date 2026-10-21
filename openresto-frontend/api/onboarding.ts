import i18n from "@/i18n";
import { apiErrorMessage } from "@/api/errors";
import { buildUrl, del, get, post, put } from "./client";
import type { RestaurantStatus, StepKey, StepState } from "@/constants/onboarding";
import type { SiteTheme } from "@/constants/site";

// ── Shapes (mirror OnboardingDto.cs) ─────────────────────────────────────────

export interface LegalDocumentRef {
  key: string;
  version: string;
}

export interface InvitationPreview {
  restaurantName: string;
  email: string;
  locale: string;
  expiresAt: string;
  documents: LegalDocumentRef[];
}

export interface AcceptInvitationInput {
  password: string;
  displayName: string | null;
  acceptedDocuments: LegalDocumentRef[];
}

export interface OnboardingRestaurantSummary {
  id: number;
  name: string;
  status: RestaurantStatus;
}

export interface OnboardingMe {
  email: string;
  displayName: string | null;
  restaurants: OnboardingRestaurantSummary[];
}

export interface OnboardingStep {
  key: StepKey;
  state: StepState;
  canSkip: boolean;
}

export interface OnboardingInfo {
  name: string;
  address: string | null;
  phoneNumber: string | null;
  emailAddress: string | null;
  legalName: string | null;
  companyNumber: string | null;
  vatNumber: string | null;
  bookingRetentionMonths: number;
}

/** What the server asks for in step 1; a missing retention keeps the stored value. */
export interface SaveInfoInput {
  name: string;
  address: string;
  phoneNumber: string;
  emailAddress: string;
  legalName: string;
  companyNumber: string;
  vatNumber: string | null;
  bookingRetentionMonths: number;
}

/** ISO day 1 (Monday) to 7 (Sunday); a day with no entry is closed. */
export interface DayHours {
  day: number;
  open: string;
  close: string;
}

export interface OnboardingHours {
  openHours: DayHours[];
  defaultBookingDurationMinutes: number;
}

export interface SaveHoursInput {
  openHours: DayHours[];
  defaultBookingDurationMinutes: number;
}

export interface OnboardingTable {
  id?: number | null;
  name: string | null;
  seats: number;
}

export interface OnboardingSection {
  id?: number | null;
  name: string;
  tables: OnboardingTable[];
}

export interface OnboardingLayout {
  sections: OnboardingSection[];
}

export interface OnboardingMenuItem {
  id?: number | null;
  name: string;
  description: string | null;
  /** Cents; null means "price on request". */
  priceMinor: number | null;
}

export interface OnboardingMenuCategory {
  id?: number | null;
  name: string;
  items: OnboardingMenuItem[];
}

export interface OnboardingMenu {
  menuId: number | null;
  name: string;
  categories: OnboardingMenuCategory[];
}

export interface SaveMenuInput {
  name: string;
  categories: OnboardingMenuCategory[];
}

export interface OnboardingBranding {
  theme: SiteTheme;
  primaryColor: string | null;
  tagline: string | null;
  logoUrl: string | null;
}

export interface SaveBrandingInput {
  theme: SiteTheme;
  /** `#rrggbb`; an empty string goes back to the platform's colour. */
  primaryColor: string;
  tagline: string;
}

export interface OnboardingLinks {
  sitePath: string | null;
  bookingPath: string | null;
  menuPath: string | null;
  menuToken: string | null;
}

export interface OnboardingState {
  id: number;
  name: string;
  status: RestaurantStatus;
  suspensionReason: string | null;
  steps: OnboardingStep[];
  nextStep: StepKey | null;
  canPublish: boolean;
  publishBlockers: StepKey[];
  info: OnboardingInfo;
  hours: OnboardingHours;
  layout: OnboardingLayout;
  menu: OnboardingMenu;
  branding: OnboardingBranding;
  links: OnboardingLinks;
  capabilities: { menuImport: boolean };
}

export interface OnboardingPreview {
  restaurantName: string;
  address: string | null;
  phoneNumber: string | null;
  openHours: DayHours[];
  tableCount: number;
  largestParty: number;
  slotIntervalMinutes: number;
  bookingDurationMinutes: number;
  sampleSlots: string[];
  menu: OnboardingMenu;
  primaryColor: string | null;
  logoUrl: string | null;
  tagline: string | null;
}

// ── Plumbing ─────────────────────────────────────────────────────────────────

/**
 * `status` is what a screen decides on (401 means the session ended, 404 that the thing is not
 * there for this caller, 0 that nothing answered), `code` is what a field matches its own
 * refusal against, and `message` is the server's sentence in the viewer's language.
 */
export type OnboardingResult<T> =
  { ok: true; value: T } | { ok: false; message: string; code?: string; status: number };

async function request<T>(
  call: () => Promise<Response>,
  read: (res: Response) => Promise<T>
): Promise<OnboardingResult<T>> {
  try {
    const res = await call();
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return {
        ok: false,
        status: res.status,
        code: typeof body?.code === "string" ? body.code : undefined,
        message: apiErrorMessage(body, i18n.t("admin.onboarding.errors.requestFailed")),
      };
    }
    return { ok: true, value: await read(res) };
  } catch {
    return { ok: false, status: 0, message: i18n.t("admin.onboarding.errors.network") };
  }
}

const json = <T>(res: Response): Promise<T> => res.json() as Promise<T>;
const stateOf = json<OnboardingState>;

const restaurantPath = (id: number) => `/onboarding/restaurants/${id}`;

// ── The invitation (anonymous) ───────────────────────────────────────────────

export const getInvitation = (token: string) =>
  request(
    () => get(`/onboarding/invitations/${encodeURIComponent(token)}`, { credentials: "omit" }),
    json<InvitationPreview>
  );

/** The server answers with the restaurant to land on and sets the session cookie. */
export const acceptInvitation = (token: string, input: AcceptInvitationInput) =>
  request(
    () => post(`/onboarding/invitations/${encodeURIComponent(token)}/accept`, input),
    json<{ restaurantId: number }>
  );

// ── Reading ──────────────────────────────────────────────────────────────────

export const getMe = () => request(() => get("/onboarding/me"), json<OnboardingMe>);

export const getState = (id: number) => request(() => get(restaurantPath(id)), stateOf);

export const getPreview = (id: number) =>
  request(() => get(`${restaurantPath(id)}/preview`), json<OnboardingPreview>);

/** The website as it renders now, as the HTML for the frame of the last stage. */
export const fetchSitePreview = (id: number) =>
  request(
    () => get(`${restaurantPath(id)}/preview/site`, { headers: { Accept: "text/html" } }),
    (res) => res.text()
  );

// ── The five steps ───────────────────────────────────────────────────────────

export const saveInfo = (id: number, input: SaveInfoInput) =>
  request(() => put(`${restaurantPath(id)}/info`, input), stateOf);

export const saveHours = (id: number, input: SaveHoursInput) =>
  request(() => put(`${restaurantPath(id)}/hours`, input), stateOf);

export const saveLayout = (id: number, input: OnboardingLayout) =>
  request(() => put(`${restaurantPath(id)}/layout`, input), stateOf);

export const saveMenu = (id: number, input: SaveMenuInput) =>
  request(() => put(`${restaurantPath(id)}/menu`, input), stateOf);

export const saveBranding = (id: number, input: SaveBrandingInput) =>
  request(() => put(`${restaurantPath(id)}/branding`, input), stateOf);

export const skipStep = (id: number, step: StepKey) =>
  request(() => post(`${restaurantPath(id)}/steps/${step}/skip`), stateOf);

// ── The logo ─────────────────────────────────────────────────────────────────

/**
 * Not through `post`: the client JSON-encodes a body, and a multipart one has to keep the
 * boundary the browser writes into its own Content-Type header.
 */
export const uploadLogo = (id: number, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return request(
    () =>
      fetch(buildUrl(`${restaurantPath(id)}/logo`), {
        method: "POST",
        credentials: "include",
        body: form,
      }),
    stateOf
  );
};

export const deleteLogo = (id: number) => request(() => del(`${restaurantPath(id)}/logo`), stateOf);

// ── Going live ───────────────────────────────────────────────────────────────

export const publish = (id: number) =>
  request(() => post(`${restaurantPath(id)}/publish`), stateOf);

export const unpublish = (id: number) =>
  request(() => post(`${restaurantPath(id)}/unpublish`), stateOf);
