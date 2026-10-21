import type {
  InvitationPreview,
  OnboardingMe,
  OnboardingPreview,
  OnboardingState,
  OnboardingStep,
} from "@/api/onboarding";
import type { StepKey, StepState } from "@/constants/onboarding";

export const ok = <T>(value: T) => ({ ok: true as const, value });

export const refused = (message: string, status = 400, code?: string) => ({
  ok: false as const,
  message,
  status,
  ...(code ? { code } : {}),
});

/** The steps as the server lists them: three required, two that can be skipped. */
export const steps = (states: Partial<Record<StepKey, StepState>> = {}): OnboardingStep[] =>
  (["info", "hours", "layout", "menu", "branding"] as const).map((key) => ({
    key,
    state: states[key] ?? "Todo",
    canSkip: key === "menu" || key === "branding",
  }));

/** A restaurant in its draft, nothing done yet. */
export const state = (over: Partial<OnboardingState> = {}): OnboardingState => ({
  id: 7,
  name: "Chez Paul",
  status: "Draft",
  suspensionReason: null,
  steps: steps(),
  nextStep: "info",
  canPublish: false,
  publishBlockers: ["info", "hours", "layout"],
  info: {
    name: "Chez Paul",
    address: null,
    phoneNumber: null,
    emailAddress: null,
    legalName: null,
    companyNumber: null,
    vatNumber: null,
    bookingRetentionMonths: 12,
  },
  hours: { openHours: [], defaultBookingDurationMinutes: 90 },
  layout: { sections: [] },
  menu: { menuId: null, name: "Carte", categories: [] },
  branding: { theme: "Brasserie", primaryColor: null, tagline: null, logoUrl: null },
  links: { sitePath: null, bookingPath: null, menuPath: null, menuToken: "tok-abc" },
  capabilities: { menuImport: false },
  ...over,
});

/** Everything required is done, so the restaurant can be published. */
export const readyState = (over: Partial<OnboardingState> = {}): OnboardingState =>
  state({
    steps: steps({
      info: "Done",
      hours: "Done",
      layout: "Done",
      menu: "Skipped",
      branding: "Skipped",
    }),
    nextStep: null,
    canPublish: true,
    publishBlockers: [],
    info: {
      name: "Chez Paul",
      address: "Rue Haute 1, 1000 Bruxelles",
      phoneNumber: "+32 2 123 45 67",
      emailAddress: "paul@chezpaul.be",
      legalName: "Chez Paul SRL",
      companyNumber: "0123.456.749",
      vatNumber: null,
      bookingRetentionMonths: 12,
    },
    hours: {
      openHours: [{ day: 2, open: "12:00", close: "22:00" }],
      defaultBookingDurationMinutes: 90,
    },
    layout: {
      sections: [{ id: 1, name: "Salle", tables: [{ id: 1, name: "T1", seats: 4 }] }],
    },
    ...over,
  });

export const liveState = (over: Partial<OnboardingState> = {}): OnboardingState =>
  readyState({
    status: "Published",
    links: {
      sitePath: "/r/chez-paul",
      bookingPath: "/locations/7",
      menuPath: "/menu/r/tok-abc",
      menuToken: "tok-abc",
    },
    ...over,
  });

export const preview = (over: Partial<OnboardingPreview> = {}): OnboardingPreview => ({
  restaurantName: "Chez Paul",
  address: "Rue Haute 1, 1000 Bruxelles",
  phoneNumber: "+32 2 123 45 67",
  openHours: [
    { day: 2, open: "12:00", close: "22:00" },
    { day: 3, open: "12:00", close: "22:00" },
  ],
  tableCount: 5,
  largestParty: 6,
  slotIntervalMinutes: 30,
  bookingDurationMinutes: 90,
  sampleSlots: ["18:00", "18:30", "19:00"],
  menu: {
    menuId: 3,
    name: "Carte",
    categories: [
      {
        id: 1,
        name: "Entrées",
        items: [
          { id: 1, name: "Croquettes aux crevettes", description: "Maison", priceMinor: 1450 },
          { id: 2, name: "Soupe du jour", description: null, priceMinor: null },
        ],
      },
    ],
  },
  primaryColor: "#b45309",
  logoUrl: null,
  tagline: "Cuisine belge",
  ...over,
});

export const me = (over: Partial<OnboardingMe> = {}): OnboardingMe => ({
  email: "paul@chezpaul.be",
  displayName: "Paul",
  restaurants: [{ id: 7, name: "Chez Paul", status: "Draft" }],
  ...over,
});

export const invitation = (over: Partial<InvitationPreview> = {}): InvitationPreview => ({
  restaurantName: "Chez Paul",
  email: "paul@chezpaul.be",
  locale: "fr",
  expiresAt: "2026-11-20T12:00:00Z",
  documents: [
    { key: "terms", version: "2026-10" },
    { key: "privacy", version: "2026-10" },
    { key: "dpa", version: "2026-10" },
  ],
  ...over,
});
