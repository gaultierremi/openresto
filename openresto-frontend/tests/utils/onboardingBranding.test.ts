import { isHexColor, isValidBrandColor } from "@/utils/onboardingBranding";

describe("isHexColor", () => {
  it("takes #rrggbb in either case", () => {
    expect(isHexColor("#b45309")).toBe(true);
    expect(isHexColor("#B45309")).toBe(true);
  });

  it("refuses everything else the server would", () => {
    for (const bad of ["b45309", "#b4530", "#b453090", "#b4530g", "#abc", "red", " #b45309", ""]) {
      expect(isHexColor(bad)).toBe(false);
    }
  });
});

describe("isValidBrandColor", () => {
  it("takes an empty field, which means the platform's colour", () => {
    expect(isValidBrandColor("")).toBe(true);
  });

  it("takes a hex colour and refuses anything else", () => {
    expect(isValidBrandColor("#112233")).toBe(true);
    expect(isValidBrandColor("#12345")).toBe(false);
  });
});
