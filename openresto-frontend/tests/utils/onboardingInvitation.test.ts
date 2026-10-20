import { canAcceptInvitation, passwordProblem } from "@/utils/onboardingInvitation";

const DOCS = [
  { key: "terms", version: "2026-10" },
  { key: "privacy", version: "2026-10" },
  { key: "dpa", version: "2026-10" },
];
const ALL = { terms: true, privacy: true, dpa: true };
const TEN = "abcdefghij";

describe("passwordProblem", () => {
  it("refuses nine characters and takes ten", () => {
    expect(passwordProblem(TEN.slice(0, 9), TEN.slice(0, 9))).toBe("tooShort");
    expect(passwordProblem(TEN, TEN)).toBeNull();
  });

  it("refuses a confirmation that differs, even from a long password", () => {
    expect(passwordProblem(TEN, `${TEN}x`)).toBe("mismatch");
  });

  it("reports the length before the mismatch", () => {
    expect(passwordProblem("short", "other")).toBe("tooShort");
  });
});

describe("canAcceptInvitation", () => {
  it("is true with a matching ten-character password and every document ticked", () => {
    expect(canAcceptInvitation(TEN, TEN, DOCS, ALL)).toBe(true);
  });

  it("is false when any single document is not ticked", () => {
    for (const missing of ["terms", "privacy", "dpa"]) {
      expect(canAcceptInvitation(TEN, TEN, DOCS, { ...ALL, [missing]: false })).toBe(false);
    }
    expect(canAcceptInvitation(TEN, TEN, DOCS, {})).toBe(false);
  });

  it("is false for a nine-character password with every document ticked", () => {
    expect(canAcceptInvitation(TEN.slice(0, 9), TEN.slice(0, 9), DOCS, ALL)).toBe(false);
  });

  it("is false for a mismatch with every document ticked", () => {
    expect(canAcceptInvitation(TEN, "other-password", DOCS, ALL)).toBe(false);
  });
});
