import { get, post } from "./client";
import { apiRequest, readJson, type ApiResult } from "@/api/request";
import type { InvitationLocale, InvitationState, PlatformStatus } from "@/constants/platform";

// ── Shapes (mirror PlatformDto.cs) ───────────────────────────────────────────

export interface PlatformInvitation {
  email: string;
  state: InvitationState;
  createdAt: string;
  expiresAt: string;
}

/** One restaurant of the list. Counts and dates only: no guest field exists on this shape. */
export interface PlatformRestaurant {
  id: number;
  name: string;
  status: PlatformStatus;
  publishedAt: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  ownerEmail: string | null;
  invitation: PlatformInvitation | null;
  lastLoginAt: string | null;
  totalBookings: number;
  upcomingBookings: number;
  stepsDone: number;
  stepsTotal: number;
  nextStep: string | null;
}

/** `invitationUrl` is shown once: the server keeps only a hash of the token. */
export interface PlatformInvitationResult {
  restaurant: PlatformRestaurant;
  invitationUrl: string;
  emailSent: boolean;
}

export interface PlatformGuestBooking {
  bookingRef: string;
  date: string;
  seats: number;
  customerName: string | null;
  customerEmail: string | null;
  specialRequests: string | null;
  isCancelled: boolean;
  isAnonymized: boolean;
}

export interface GuestDataAccess {
  restaurantId: number;
  restaurantName: string;
  grantedAt: string;
  /** All the restaurant's bookings: `bookings` holds only the most recent ones. */
  totalBookings: number;
  bookings: PlatformGuestBooking[];
}

export interface LegalAcceptance {
  documentKey: string;
  version: string;
  email: string;
  contentSha256: string;
  acceptedAt: string;
}

export type PlatformResult<T> = ApiResult<T>;

const base = "/platform/restaurants";

// ── The list and the invitations ─────────────────────────────────────────────

export const fetchPlatformRestaurants = () =>
  apiRequest(() => get(base), readJson<PlatformRestaurant[]>);

export const createPlatformRestaurant = (input: {
  name: string;
  ownerEmail: string;
  locale: InvitationLocale;
}) => apiRequest(() => post(base, input), readJson<PlatformInvitationResult>);

/** A blank `email` re-invites the address of the previous invitation. */
export const sendPlatformInvitation = (
  restaurantId: number,
  input: { email?: string; locale: InvitationLocale }
) =>
  apiRequest(
    () => post(`${base}/${restaurantId}/invitations`, input),
    readJson<PlatformInvitationResult>
  );

// ── Suspension ───────────────────────────────────────────────────────────────

export const suspendPlatformRestaurant = (restaurantId: number, reason: string | null) =>
  apiRequest(
    () => post(`${base}/${restaurantId}/suspend`, { reason }),
    readJson<PlatformRestaurant>
  );

export const reactivatePlatformRestaurant = (restaurantId: number) =>
  apiRequest(() => post(`${base}/${restaurantId}/reactivate`), readJson<PlatformRestaurant>);

// ── Guests and consents ──────────────────────────────────────────────────────

/** A POST although it reads: opening the guests is an act the audit trail records with `reason`. */
export const accessPlatformGuestData = (restaurantId: number, reason: string) =>
  apiRequest(
    () => post(`${base}/${restaurantId}/guest-data-access`, { reason }),
    readJson<GuestDataAccess>
  );

export const fetchPlatformConsents = (restaurantId: number) =>
  apiRequest(() => get(`${base}/${restaurantId}/consents`), readJson<LegalAcceptance[]>);
