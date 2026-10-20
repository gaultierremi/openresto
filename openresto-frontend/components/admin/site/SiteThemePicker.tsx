import { Pressable, View, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import { useAppTheme } from "@/hooks/use-app-theme";
import { SITE_THEMES, type SiteTheme } from "@/constants/site";
import { styles } from "./SiteThemePicker.styles";

/**
 * What each theme's miniature is painted with. Decorative: it hints at the look (warm paper, near
 * black, white with a tint) without being the page, which the preview beside the form shows.
 */
const MINIATURES: Record<
  SiteTheme,
  { background: string; line: string; radius: number; barRadius: number }
> = {
  Brasserie: { background: "#faf5ec", line: "#d8cdb9", radius: 4, barRadius: 2 },
  Gastronomique: { background: "#12100e", line: "#4a443c", radius: 0, barRadius: 0 },
  Cafe: { background: "#e8f3f7", line: "#b9d6e0", radius: 16, barRadius: 8 },
};

/**
 * The three looks of a site as a radio group. Choosing one is also what the preview shows next,
 * and the autosave's undo takes it back, so trying a theme costs a press.
 *
 * @see [SiteThemePicker.test.tsx](../../../tests/components/admin/site/SiteThemePicker.test.tsx)
 * — pins that each card selects its own theme, that the chosen one is the checked radio, and
 * that the brand colour paints the miniatures' accent.
 */
export function SiteThemePicker({
  value,
  brandColor,
  onChange,
}: {
  value: SiteTheme;
  brandColor: string;
  onChange: (theme: SiteTheme) => void;
}) {
  const { t } = useTranslation();
  const { colors, primaryColor } = useAppTheme();

  const copy: Record<SiteTheme, { name: string; description: string }> = {
    Brasserie: {
      name: t("admin.site.themes.brasserie.name"),
      description: t("admin.site.themes.brasserie.description"),
    },
    Gastronomique: {
      name: t("admin.site.themes.gastronomique.name"),
      description: t("admin.site.themes.gastronomique.description"),
    },
    Cafe: {
      name: t("admin.site.themes.cafe.name"),
      description: t("admin.site.themes.cafe.description"),
    },
  };

  return (
    <View
      style={styles.group}
      accessibilityRole="radiogroup"
      accessibilityLabel={t("admin.site.themes.label")}
    >
      {SITE_THEMES.map((theme) => {
        const checked = theme === value;
        const mini = MINIATURES[theme];
        const swatch: ViewStyle = { backgroundColor: mini.background, borderRadius: mini.radius };
        return (
          <Pressable
            key={theme}
            testID={`site-theme-${theme}`}
            onPress={() => onChange(theme)}
            accessibilityRole="radio"
            accessibilityLabel={copy[theme].name}
            accessibilityHint={copy[theme].description}
            accessibilityState={{ checked }}
            style={[
              styles.option,
              {
                borderColor: checked ? primaryColor : colors.border,
                backgroundColor: colors.card,
              },
            ]}
          >
            <View style={[styles.swatch, swatch]}>
              <View
                style={[styles.bar, { backgroundColor: brandColor, borderRadius: mini.barRadius }]}
              />
              <View style={[styles.line, { backgroundColor: mini.line, width: "90%" }]} />
              <View style={[styles.line, { backgroundColor: mini.line, width: "70%" }]} />
            </View>
            <ThemedText style={styles.name}>{copy[theme].name}</ThemedText>
            <ThemedText style={[styles.description, { color: colors.muted }]}>
              {copy[theme].description}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}
