import { useColorScheme } from "@/hooks/use-color-scheme";
import { getThemeColors, theme } from "@/theme/theme";
import { brandPalette } from "@/theme/brandColors";
import { useBrand } from "@/context/BrandContext";
import { useMemo } from "react";

/**
 * `primaryColor` is the brand colour as drawn on the current theme: the chosen one when it is
 * legible there, otherwise the nearest shade that is (see `brandPalette`). `onPrimary` is what to
 * draw on a fill of it, so a label on a brand fill takes `onPrimary` and never a fixed white.
 * `brand.primaryColor` stays the colour as chosen, for the favicon and the installable app's
 * theme colour, which are not read as text.
 *
 * @see [use-app-theme.test.ts](../tests/hooks/use-app-theme.test.ts) — pins that the chosen
 * colour and the scheme go through the palette, in the admin as for a guest.
 */
export function useAppTheme() {
  const brand = useBrand();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const colors = useMemo(() => getThemeColors(isDark), [isDark]);

  const chosen = brand.primaryColor || theme.colors.primary;
  const { primary: primaryColor, onPrimary } = useMemo(
    () => brandPalette(chosen, isDark),
    [chosen, isDark]
  );

  return { brand, isDark, colors, primaryColor, onPrimary };
}
