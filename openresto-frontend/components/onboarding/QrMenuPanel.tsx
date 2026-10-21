import { useMemo } from "react";
import { Image, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import { useAppTheme } from "@/hooks/use-app-theme";
import { MENU_CURRENCY } from "@/constants/onboarding";
import { formatPrice } from "@/utils/menuPrice";
import { menuUrl, qrToSvg, svgToDataUri } from "@/utils/qrCode";
import type { OnboardingMenu } from "@/api/onboarding";
import { styles } from "./QrMenuPanel.styles";

/**
 * The QR menu as the guest will meet it: the code that opens the menu page and the categories
 * and dishes that page will list. The address is the platform's own, so a code printed now keeps
 * working once the restaurant is published; until then the page itself answers "not found".
 *
 * @see [QrMenuPanel.test.tsx](../../tests/components/onboarding/QrMenuPanel.test.tsx) — pins the
 * address the code carries, the price shown or "on request", and the empty menu.
 */
export function QrMenuPanel({
  menu,
  menuToken,
  published,
}: {
  menu: OnboardingMenu;
  menuToken: string | null;
  published: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const url = menuToken ? menuUrl(window.location.origin, "r", menuToken) : null;
  const dataUri = useMemo(() => (url ? svgToDataUri(qrToSvg(url)) : null), [url]);

  return (
    <View style={styles.root} testID="qr-menu-panel">
      {url && dataUri ? (
        <View style={styles.top}>
          <Image
            source={{ uri: dataUri }}
            style={styles.code}
            accessibilityLabel={t("admin.onboarding.preview.qr.codeLabel")}
            resizeMode="contain"
          />
          <View style={styles.text}>
            <ThemedText style={[styles.url, { color: colors.muted }]} selectable testID="qr-url">
              {url}
            </ThemedText>
            <ThemedText style={[styles.note, { color: colors.muted }]}>
              {published
                ? t("admin.onboarding.preview.qr.noteLive")
                : t("admin.onboarding.preview.qr.noteDraft")}
            </ThemedText>
          </View>
        </View>
      ) : null}

      {menu.categories.length === 0 ? (
        <ThemedText style={{ color: colors.muted }} testID="qr-menu-empty">
          {t("admin.onboarding.preview.qr.empty")}
        </ThemedText>
      ) : (
        <View style={styles.menu}>
          {menu.categories.map((category, categoryIndex) => (
            <View key={category.id ?? categoryIndex} style={styles.category}>
              <ThemedText style={styles.categoryName}>{category.name}</ThemedText>
              {category.items.map((item, itemIndex) => (
                <View key={item.id ?? itemIndex} style={styles.dish}>
                  <View style={styles.dishText}>
                    <ThemedText style={styles.dishName}>{item.name}</ThemedText>
                    {item.description ? (
                      <ThemedText style={[styles.dishDescription, { color: colors.muted }]}>
                        {item.description}
                      </ThemedText>
                    ) : null}
                  </View>
                  <ThemedText
                    style={[styles.price, item.priceMinor === null && { color: colors.muted }]}
                  >
                    {item.priceMinor === null
                      ? t("admin.onboarding.preview.qr.priceOnRequest")
                      : formatPrice(item.priceMinor, MENU_CURRENCY)}
                  </ThemedText>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
