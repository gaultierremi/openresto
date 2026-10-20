import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import { MenuPhoto } from "@/components/menu/MenuPhoto";
import { useAppTheme } from "@/hooks/use-app-theme";
import { hexToRgba } from "@/utils/colors";
import { formatPrice } from "@/utils/menuPrice";
import type { PublicMenuItem } from "@/api/menus";
import { styles } from "./MenuItemRow.styles";

const PHOTO_SIZE = 76;

/** The price as a guest reads it: an amount, "free", or "price on request". */
export function usePriceLabel() {
  const { t } = useTranslation();
  return (priceMinor: number | null, currency: string) => {
    if (priceMinor === null) return t("common.menu.priceOnRequest");
    if (priceMinor === 0) return t("common.menu.free");
    return formatPrice(priceMinor, currency);
  };
}

/**
 * One dish on the public page. A sold-out dish stays in its place, greyed with the muted text
 * colour and marked with a badge, so a guest sees it exists and is not offered it. It is never
 * dimmed with opacity: that halves the contrast of the allergen line, which a guest with an
 * allergy has to be able to read on a dish they might still ask about.
 *
 * @see [MenuItemRow.test.tsx](../../tests/components/menu/MenuItemRow.test.tsx) — pins the
 * three price states, the sold-out mark and greying without opacity, and that allergens and
 * diets are listed.
 */
export function MenuItemRow({ item, currency }: { item: PublicMenuItem; currency: string }) {
  const { t } = useTranslation();
  const { colors, primaryColor } = useAppTheme();
  const priceLabel = usePriceLabel();
  const soldOut = item.availability === "SoldOut";

  return (
    <View
      testID="menu-item"
      style={[styles.row, { borderBottomColor: colors.border }]}
    >
      <View style={styles.body}>
        <View style={styles.titleLine}>
          <ThemedText style={[styles.name, soldOut && { color: colors.muted }]}>
            {item.name}
          </ThemedText>
          {soldOut && (
            <View style={[styles.badge, { backgroundColor: colors.surfaceAlt }]}>
              <ThemedText style={[styles.badgeText, { color: colors.muted }]}>
                {t("common.menu.availability.SoldOut")}
              </ThemedText>
            </View>
          )}
        </View>
        {item.description ? (
          <ThemedText style={[styles.description, { color: colors.muted }]}>
            {item.description}
          </ThemedText>
        ) : null}
        {item.dietaryTags.length > 0 && (
          <View style={styles.tags}>
            {item.dietaryTags.map((tag) => (
              <View
                key={tag}
                style={[styles.tag, { backgroundColor: hexToRgba(primaryColor, 0.12) }]}
              >
                <ThemedText style={[styles.tagText, { color: primaryColor }]}>
                  {t(`common.menu.dietary.${tag}`)}
                </ThemedText>
              </View>
            ))}
          </View>
        )}
        {item.allergens.length > 0 && (
          <ThemedText style={[styles.allergens, { color: colors.muted }]}>
            {t("restaurant.publicMenu.contains", {
              list: item.allergens.map((a) => t(`common.menu.allergens.${a}`)).join(", "),
            })}
          </ThemedText>
        )}
      </View>
      <View style={styles.side}>
        <ThemedText style={[styles.price, soldOut && { color: colors.muted }]}>
          {priceLabel(item.priceMinor, currency)}
        </ThemedText>
        {item.imageUrl ? <MenuPhoto uri={item.imageUrl} size={PHOTO_SIZE} /> : null}
      </View>
    </View>
  );
}
