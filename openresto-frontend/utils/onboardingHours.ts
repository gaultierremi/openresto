import {
  ALLOWED_BOOKING_DURATIONS,
  DEFAULT_BOOKING_DURATION,
  DEFAULT_CLOSE_TIME,
  DEFAULT_OPEN_TIME,
  ISO_DAYS,
} from "@/constants/onboarding";
import type { DayHours } from "@/api/onboarding";

/** One line of the week as the form edits it: closed days keep their times for when they reopen. */
export interface HourRow {
  day: number;
  open: boolean;
  openTime: string;
  closeTime: string;
}

/** The seven rows, Monday first, from the server's list of open days. */
export function rowsFromHours(hours: DayHours[]): HourRow[] {
  return ISO_DAYS.map((day) => {
    const entry = hours.find((h) => h.day === day);
    return {
      day,
      open: entry !== undefined,
      openTime: entry?.open ?? DEFAULT_OPEN_TIME,
      closeTime: entry?.close ?? DEFAULT_CLOSE_TIME,
    };
  });
}

/** What the server is sent: one entry per open day, and a day with no entry is closed. */
export function rowsToHours(rows: HourRow[]): DayHours[] {
  return rows
    .filter((row) => row.open)
    .map((row) => ({ day: row.day, open: row.openTime, close: row.closeTime }));
}

export const hasOpenDay = (rows: HourRow[]): boolean => rows.some((row) => row.open);

export const patchRow = (rows: HourRow[], day: number, patch: Partial<HourRow>): HourRow[] =>
  rows.map((row) => (row.day === day ? { ...row, ...patch } : row));

/**
 * The first open day's times on every day. Whether a day is open is left alone: copying hours
 * must not quietly open a day the restaurant is closed.
 */
export function copyFirstOpenDay(rows: HourRow[]): HourRow[] {
  const source = rows.find((row) => row.open);
  if (!source) return rows;
  return rows.map((row) => ({ ...row, openTime: source.openTime, closeTime: source.closeTime }));
}

/** A stored sitting length the server would now refuse starts the form on the usual one. */
export const normalizeDuration = (minutes: number): number =>
  ALLOWED_BOOKING_DURATIONS.includes(minutes) ? minutes : DEFAULT_BOOKING_DURATION;
