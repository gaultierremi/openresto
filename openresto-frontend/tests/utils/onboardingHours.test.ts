import {
  copyFirstOpenDay,
  hasOpenDay,
  normalizeDuration,
  patchRow,
  rowsFromHours,
  rowsToHours,
} from "@/utils/onboardingHours";

describe("rowsFromHours", () => {
  it("makes seven rows, Monday first, open only where the server listed a day", () => {
    const rows = rowsFromHours([
      { day: 5, open: "18:00", close: "23:00" },
      { day: 2, open: "12:00", close: "14:30" },
    ]);
    expect(rows.map((r) => r.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(rows.filter((r) => r.open).map((r) => r.day)).toEqual([2, 5]);
    expect(rows[1]).toEqual({ day: 2, open: true, openTime: "12:00", closeTime: "14:30" });
  });

  it("gives a closed day the default times for when it reopens", () => {
    expect(rowsFromHours([])[0]).toEqual({
      day: 1,
      open: false,
      openTime: "09:00",
      closeTime: "22:00",
    });
  });
});

describe("rowsToHours", () => {
  it("sends only the open days, so a day with no entry is closed", () => {
    const rows = patchRow(rowsFromHours([]), 3, { open: true, openTime: "11:00" });
    expect(rowsToHours(rows)).toEqual([{ day: 3, open: "11:00", close: "22:00" }]);
  });

  it("sends nothing for a week with every day closed", () => {
    expect(rowsToHours(rowsFromHours([]))).toEqual([]);
  });
});

describe("hasOpenDay", () => {
  it("is false for an all-closed week and true with a single open day", () => {
    const closed = rowsFromHours([]);
    expect(hasOpenDay(closed)).toBe(false);
    expect(hasOpenDay(patchRow(closed, 7, { open: true }))).toBe(true);
  });
});

describe("copyFirstOpenDay", () => {
  const week = patchRow(
    patchRow(rowsFromHours([]), 2, { open: true, openTime: "12:00", closeTime: "15:00" }),
    4,
    { open: true, openTime: "18:00", closeTime: "23:00" }
  );

  it("puts the first open day's times on every day", () => {
    const copied = copyFirstOpenDay(week);
    expect(copied.every((r) => r.openTime === "12:00" && r.closeTime === "15:00")).toBe(true);
  });

  it("does not open a day that is closed", () => {
    const copied = copyFirstOpenDay(week);
    expect(copied.filter((r) => r.open).map((r) => r.day)).toEqual([2, 4]);
  });

  it("changes nothing when no day is open", () => {
    const closed = rowsFromHours([]);
    expect(copyFirstOpenDay(closed)).toBe(closed);
  });
});

describe("normalizeDuration", () => {
  it("keeps a length the server accepts", () => {
    expect(normalizeDuration(120)).toBe(120);
    expect(normalizeDuration(30)).toBe(30);
  });

  it("starts the form on 90 minutes for one it would refuse", () => {
    expect(normalizeDuration(45)).toBe(90);
    expect(normalizeDuration(0)).toBe(90);
  });
});
