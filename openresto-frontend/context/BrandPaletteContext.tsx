import { createContext, useContext, type ReactNode } from "react";

/**
 * How `useAppTheme()` hands out the brand colour.
 *
 * - `readable`: nudged to WCAG AA on the current theme, with an `onPrimary` label that holds on
 *   it (see `brandPalette`). The guest's side: the booking pages, the QR menu, the legal pages.
 * - `chosen`: exactly as the restaurateur picked it, under a white label. The restaurateur's own
 *   screens (the admin, the onboarding), where a good many labels sit white on a brand fill and
 *   have not been moved to `onPrimary` yet; lifting the fill on the dark theme without them
 *   would take a white label under AA, which is worse than the colour they chose.
 *
 * @see [use-app-theme.test.ts](../tests/hooks/use-app-theme.test.ts) — pins that a scope hands
 * the colour out untouched and that outside one it is made readable.
 */
export type BrandPaletteMode = "readable" | "chosen";

const BrandPaletteContext = createContext<BrandPaletteMode>("readable");

/** Everything under it takes the brand colour in `mode`; the default, with no scope, is readable. */
export function BrandPaletteScope({
  mode,
  children,
}: {
  mode: BrandPaletteMode;
  children: ReactNode;
}) {
  return <BrandPaletteContext.Provider value={mode}>{children}</BrandPaletteContext.Provider>;
}

export function useBrandPaletteMode(): BrandPaletteMode {
  return useContext(BrandPaletteContext);
}
