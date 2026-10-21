import type {
  GuestDataAccess,
  LegalAcceptance,
  PlatformGuestBooking,
  PlatformInvitationResult,
  PlatformRestaurant,
} from "@/api/platform";
import type { LegalDocument } from "@/api/legal";
import type { ApiResult } from "@/api/request";

export const ok = <T>(value: T): ApiResult<T> => ({ ok: true, value });
export const refused = (message: string, code?: string): ApiResult<never> => ({
  ok: false,
  message,
  code,
});

export function restaurant(overrides: Partial<PlatformRestaurant> = {}): PlatformRestaurant {
  return {
    id: 1,
    name: "Chez Léa",
    status: "Published",
    publishedAt: "2026-09-01T10:00:00Z",
    suspendedAt: null,
    suspensionReason: null,
    ownerEmail: "lea@example.com",
    invitation: null,
    lastLoginAt: "2026-10-18T08:30:00Z",
    totalBookings: 42,
    upcomingBookings: 7,
    stepsDone: 5,
    stepsTotal: 5,
    nextStep: null,
    bookingRetentionMonths: 12,
    ...overrides,
  };
}

export function invitationResult(
  overrides: Partial<PlatformInvitationResult> = {}
): PlatformInvitationResult {
  return {
    restaurant: restaurant(),
    invitationUrl: "https://resto.example/onboarding/accept?token=abcdef123456",
    emailSent: true,
    ...overrides,
  };
}

export function guestBooking(overrides: Partial<PlatformGuestBooking> = {}): PlatformGuestBooking {
  return {
    bookingRef: "AB12CD",
    date: "2026-10-25T18:30:00Z",
    seats: 4,
    customerName: "Camille Dupont",
    customerEmail: "camille@example.com",
    specialRequests: "Chaise haute",
    isCancelled: false,
    isAnonymized: false,
    ...overrides,
  };
}

export function guestData(overrides: Partial<GuestDataAccess> = {}): GuestDataAccess {
  return {
    restaurantId: 1,
    restaurantName: "Chez Léa",
    grantedAt: "2026-10-20T10:00:00Z",
    totalBookings: 1,
    bookings: [guestBooking()],
    ...overrides,
  };
}

export function acceptance(overrides: Partial<LegalAcceptance> = {}): LegalAcceptance {
  return {
    documentKey: "terms",
    version: "2026-10-20",
    email: "lea@example.com",
    contentSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    acceptedAt: "2026-10-01T09:00:00Z",
    ...overrides,
  };
}

export function legalDocument(overrides: Partial<LegalDocument> = {}): LegalDocument {
  return {
    key: "terms",
    version: "2026-10-20",
    title: "Conditions d’utilisation de l’offre gratuite",
    language: "fr",
    needsLegalReview: true,
    updatedOn: "2026-10-20",
    contentSha256: "abc",
    sections: [
      {
        heading: "1. Parties et objet",
        paragraphs: [
          "Les présentes conditions lient [Dénomination de la société exploitante] et le restaurateur.",
          "Elles régissent l’usage de l’offre gratuite.",
        ],
      },
      { heading: "2. Description du service", paragraphs: ["Le service est fourni tel quel."] },
    ],
    ...overrides,
  };
}
