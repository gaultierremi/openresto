import i18n from "@/i18n";
import { del, get, post, put } from "./client";
import { request } from "./onboarding";
import type { WaitlistBoard } from "./waitlist";

export interface ServiceException {
  date: string;
  closed: boolean;
  open: string;
  close: string;
}
export interface OperationsBooking {
  id: number;
  reference: string;
  name: string | null;
  email: string | null;
  date: string;
  seats: number;
  status: string;
  cancelled: boolean;
  reminder: string | null;
  nextStatuses: string[];
}
export interface OperationsDay {
  date: string;
  bookings: number;
  covers: number;
  noShows: number;
  fillRate: number | null;
}
export interface OperationsData {
  name: string;
  timezone: string;
  status: string;
  today: string;
  days: OperationsDay[];
  bookings: OperationsBooking[];
  dishes: { name: string; views: number }[];
  exceptions: ServiceException[];
  simulateEmailReminders: boolean;
}
const root = (id: number) => `/onboarding/restaurants/${id}/operations`;
const nothing = async () => undefined;
export const getOperations = (id: number) =>
  request(
    () => get(root(id)),
    (r) => r.json() as Promise<OperationsData>
  );
export const getOperationsWaitlist = (id: number) =>
  request(
    () => get(`${root(id)}/waitlist`),
    (r) => r.json() as Promise<WaitlistBoard>
  );
export const saveException = (id: number, input: ServiceException) =>
  request(() => put(`${root(id)}/exceptions`, input), nothing);
export const removeException = (id: number, date: string) =>
  request(() => del(`${root(id)}/exceptions/${encodeURIComponent(date)}`), nothing);
export const setReminderMode = (id: number, simulated: boolean) =>
  request(() => put(`${root(id)}/reminders`, { simulated }), nothing);
export const setOperationsStatus = (id: number, booking: number, status: string) =>
  request(() => put(`${root(id)}/bookings/${booking}/status`, { status }), nothing);
export const addOperationsWaitlist = (id: number, name: string, seats: number, email: string) =>
  request(
    () =>
      post(`${root(id)}/waitlist`, { name, seats, email: email || null, locale: i18n.language }),
    nothing
  );
export const actOnOperationsWaitlist = (id: number, entry: number, action: "seat" | "remove") =>
  request(() => post(`${root(id)}/waitlist/${entry}/${action}`), nothing);
export const exportOperations = (id: number) =>
  request(
    () => get(`${root(id)}/export.csv`),
    (r) => r.text()
  );
