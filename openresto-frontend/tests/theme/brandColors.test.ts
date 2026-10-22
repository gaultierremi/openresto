import { AA_TEXT_CONTRAST, brandPalette } from "@/theme/brandColors";
import { theme } from "@/theme/theme";
import { blend, contrastRatio } from "@/utils/contrast";

const lightSurfaces = [
  theme.colors.card.light,
  theme.colors.page.light,
  theme.colors.surfaceAlt.light,
];
const darkSurfaces = [theme.colors.card.dark, theme.colors.page.dark, theme.colors.surfaceAlt.dark];

// The ones the audit and the review met, the instance default, and the ends of the range.
const BRANDS = [
  "#059669",
  "#0a7ea4",
  "#2563eb",
  "#0f766e",
  "#1a237e",
  "#7c3aed",
  "#dc2626",
  "#fde68a",
  "#ffd400",
  "#888888",
  "#000000",
  "#ffffff",
];

describe("brandPalette", () => {
  describe.each([
    ["light", false],
    ["dark", true],
  ] as const)("the label and the colour, whatever the brand, on the %s theme", (_name, isDark) => {
    it.each(BRANDS)("%s: the fill holds its label and reads as text on the card", (brand) => {
      const { primary, onPrimary } = brandPalette(brand, isDark);
      expect(contrastRatio(primary, onPrimary)).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
      const card = isDark ? theme.colors.card.dark : theme.colors.card.light;
      expect(contrastRatio(primary, card)).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
    });
  });

  describe("on the light theme", () => {
    it("moves a brand colour that fails AA until it reads as text on every surface", () => {
      // #059669 is 3.76:1 on white: the demo brand that failed in the audit.
      const { primary } = brandPalette("#059669", false);
      expect(primary).not.toBe("#059669");
      for (const surface of [...lightSurfaces, blend(primary, theme.colors.card.light, 0.18)]) {
        expect(contrastRatio(primary, surface)).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
      }
    });

    it("keeps white as the label, which the darkened fill holds at AA", () => {
      const { primary, onPrimary } = brandPalette("#059669", false);
      expect(onPrimary).toBe("#ffffff");
      expect(contrastRatio(primary, onPrimary)).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
    });

    it("leaves a brand colour that is already legible exactly as chosen", () => {
      expect(brandPalette("#1a237e", false).primary).toBe("#1a237e");
    });
  });

  describe("on the dark theme", () => {
    it("moves a brand colour that fails AA on dark surfaces lighter", () => {
      const { primary } = brandPalette("#1a237e", true);
      expect(primary).not.toBe("#1a237e");
      for (const surface of [...darkSurfaces, blend(primary, theme.colors.card.dark, 0.18)]) {
        expect(contrastRatio(primary, surface)).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
      }
    });

    it("draws a dark label on a fill too light to hold white, and it reaches AA", () => {
      const { primary, onPrimary } = brandPalette("#059669", true);
      expect(onPrimary).toBe(theme.colors.page.dark);
      expect(contrastRatio(primary, onPrimary)).toBeGreaterThanOrEqual(AA_TEXT_CONTRAST);
    });

    it("leaves a brand colour that is already legible exactly as chosen", () => {
      expect(brandPalette("#fde68a", true).primary).toBe("#fde68a");
    });
  });
});
