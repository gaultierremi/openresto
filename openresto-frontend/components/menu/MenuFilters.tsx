import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/common/Icon";
import { useAppTheme } from "@/hooks/use-app-theme";
import { hexToRgba } from "@/utils/colors";
import { ALLERGENS, DIETARY_TAGS } from "@/constants/menu";
import { isFilterActive, NO_FILTER, toggleIn, type MenuFilter } from "@/utils/menuFilter";
import { styles } from "./MenuFilters.styles";

/**
 * A toggle pill. `checkbox` for a set a guest or an admin ticks any number of (diets,
 * allergens), `radio` for one choice out of a few (a dish's availability).
 */
export function FilterChip({
  label,
  selected,
  onPress,
  testID,
  role = "checkbox",
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
  role?: "checkbox" | "radio";
}) {
  const { colors, primaryColor } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      // react-native-web reads the `aria-*` prop, not `accessibilityState`, so without this the
      // rendered element is a checkbox that never says whether it is checked.
      aria-checked={selected}
      accessibilityLabel={label}
      style={[
        styles.chip,
        {
          borderColor: selected ? primaryColor : colors.borderStrong,
          backgroundColor: colors.card,
        },
        selected && { backgroundColor: hexToRgba(primaryColor, 0.14) },
      ]}
    >
      {selected && <Icon name="checkmark" size="sm" color={primaryColor} />}
      <ThemedText
        style={[styles.chipText, selected && { color: primaryColor, fontWeight: "700" }]}
        numberOfLines={1}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

/**
 * What a guest narrows the menu with: the three diets always on show, and the fourteen
 * allergens behind one toggle, since fourteen chips open at once push the dishes off a phone
 * screen. A filter hides what a dish declares against it, and says plainly that the
 * declaration is the restaurant's.
 *
 * @see [MenuFilters.test.tsx](../../tests/components/menu/MenuFilters.test.tsx) — pins the
 * diet and allergen toggles, the reset, and that the allergen panel opens on a pre-selected one.
 */
export function MenuFilters({
  filter,
  onChange,
}: {
  filter: MenuFilter;
  onChange: (next: MenuFilter) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [allergensOpen, setAllergensOpen] = useState(filter.avoid.length > 0);

  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.headingRow}>
        <ThemedText style={[styles.heading, { color: colors.muted }]}>
          {t("restaurant.publicMenu.filters.diets")}
        </ThemedText>
        {isFilterActive(filter) && (
          <Pressable
            onPress={() => onChange(NO_FILTER)}
            testID="menu-filters-clear"
            accessibilityRole="button"
            style={styles.clear}
          >
            <ThemedText style={[styles.clearText, { color: colors.muted }]}>
              {t("restaurant.publicMenu.filters.clear")}
            </ThemedText>
          </Pressable>
        )}
      </View>
      <View style={styles.chips}>
        {DIETARY_TAGS.map((tag) => (
          <FilterChip
            key={tag}
            testID={`menu-diet-${tag}`}
            label={t(`common.menu.dietary.${tag}`)}
            selected={filter.diets.includes(tag)}
            onPress={() => onChange({ ...filter, diets: toggleIn(filter.diets, tag) })}
          />
        ))}
      </View>

      <Pressable
        onPress={() => setAllergensOpen((open) => !open)}
        testID="menu-allergens-toggle"
        accessibilityRole="button"
        accessibilityState={{ expanded: allergensOpen }}
        aria-expanded={allergensOpen}
        style={styles.toggle}
      >
        <ThemedText style={[styles.heading, styles.toggleText, { color: colors.muted }]}>
          {filter.avoid.length > 0
            ? t("restaurant.publicMenu.filters.avoidWithCount", { count: filter.avoid.length })
            : t("restaurant.publicMenu.filters.avoid")}
        </ThemedText>
        <Icon name={allergensOpen ? "chevron-up" : "chevron-down"} size="md" color={colors.muted} />
      </Pressable>
      {allergensOpen && (
        <View style={styles.chips}>
          {ALLERGENS.map((allergen) => (
            <FilterChip
              key={allergen}
              testID={`menu-allergen-${allergen}`}
              label={t(`common.menu.allergens.${allergen}`)}
              selected={filter.avoid.includes(allergen)}
              onPress={() => onChange({ ...filter, avoid: toggleIn(filter.avoid, allergen) })}
            />
          ))}
        </View>
      )}

      {(allergensOpen || isFilterActive(filter)) && (
        <ThemedText
          style={[styles.disclaimer, { color: colors.muted }]}
          testID="menu-filters-disclaimer"
        >
          {t("restaurant.publicMenu.filters.disclaimer")}
        </ThemedText>
      )}
    </View>
  );
}
