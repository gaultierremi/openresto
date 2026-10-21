import { useColorScheme } from "@/hooks/use-color-scheme";
import { getThemeColors, theme } from "@/theme/theme";
import { brandPalette } from "@/theme/brandColors";
import { useBrand } from "@/context/BrandContext";
import { useBrandPaletteMode } from "@/context/BrandPaletteContext";
import { useMemo } from "react";

/**
 * `primaryColor` is the brand colour as drawn on the current theme: the chosen one when it is
 * legible there, otherwise the nearest shade that is (see `brandPalette`). `onPrimary` is what to
 * draw on a fill of it. `brand.primaryColor` stays the colour as chosen, for the favicon and the
 * installable app's theme colour, which are not read as text.
 *
 * Under a `BrandPaletteScope` of mode `chosen` (the admin and the onboarding) the colour is
 * handed out exactly as picked, under a white `onPrimary`.
 */
export function useAppTheme() {
  const brand = useBrand();
  const colorScheme = useColorScheme();
  const mode = useBrandPaletteMode();
  const isDark = colorScheme === "dark";

  const colors = useMemo(() => getThemeColors(isDark), [isDark]);

  const chosen = brand.primaryColor || theme.colors.primary;
  const { primary: primaryColor, onPrimary } = useMemo(
    () =>
      mode === "chosen"
        ? { primary: chosen, onPrimary: theme.colors.white }
        : brandPalette(chosen, isDark),
    [mode, chosen, isDark]
  );

  return { brand, isDark, colors, primaryColor, onPrimary };
}
