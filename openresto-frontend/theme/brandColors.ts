import { theme } from "@/theme/theme";
import { blend, ensureContrast } from "@/utils/contrast";

/** WCAG AA for body text; the brand colour is used at 18px and under in most places. */
export const AA_TEXT_CONTRAST = 4.5;

/** How strongly the brand colour tints the surfaces behind it (tags, notices, selected rows). */
const TINT_ALPHA = 0.18;

export interface BrandPalette {
  /** The brand colour, moved only as far as it needs to be readable as text and as a fill. */
  primary: string;
  /** What to draw on a `primary` fill: its label, its icon. */
  onPrimary: string;
}

/**
 * The brand colour the restaurateur chose is theirs and arbitrary; legibility is not. Text in the
 * brand colour and white text on a brand-coloured button both have to reach AA, on every surface
 * the app draws them on (page, card, recessed chip, and the brand's own tint), or the guest who
 * most needs the contrast, in daylight on a phone, cannot read the price or the Book button.
 *
 * A colour that already does is returned untouched. Otherwise it moves along its own lightness:
 * darker on the light theme, where the fill keeps its white label, and lighter on the dark theme,
 * where the fill takes a dark label instead (a lighter fill cannot hold white).
 *
 * @see [brandColors.test.ts](../tests/theme/brandColors.test.ts) — pins that a failing brand
 * colour is moved to AA on both themes and a passing one is left exactly as chosen.
 */
export function brandPalette(brandColor: string, isDark: boolean): BrandPalette {
  const surfaces = isDark
    ? [theme.colors.card.dark, theme.colors.page.dark, theme.colors.surfaceAlt.dark]
    : [theme.colors.card.light, theme.colors.page.light, theme.colors.surfaceAlt.light];

  const primary = ensureContrast(
    brandColor,
    (candidate) => [...surfaces, blend(candidate, surfaces[0], TINT_ALPHA)],
    AA_TEXT_CONTRAST
  );

  // On the dark theme the colour has to reach AA against surfaces nearly black, which puts its
  // luminance above 0.23: white cannot hold on that (3.7:1 at best), the page's own near-black
  // does (5:1 at worst). So the label is not a comparison, it is the one that always passes.
  return { primary, onPrimary: isDark ? theme.colors.page.dark : theme.colors.white };
}
