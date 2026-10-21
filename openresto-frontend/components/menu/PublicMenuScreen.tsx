import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import Button from "@/components/common/Button";
import LanguageSwitcher from "@/components/common/LanguageSwitcher";
import { Icon } from "@/components/common/Icon";
import { MenuFilters } from "@/components/menu/MenuFilters";
import { MenuItemRow } from "@/components/menu/MenuItemRow";
import { fetchPublicMenu, type PublicMenuKind, type PublicMenuOutcome } from "@/api/menus";
import { useAppTheme } from "@/hooks/use-app-theme";
import { MENU_DEFAULT_LOCALE } from "@/constants/locales";
import { useRouteDefaultLocale } from "@/context/LocaleContext";
import { useMenuFilter } from "@/hooks/use-menu-filter";
import { filterCategories, isFilterActive } from "@/utils/menuFilter";
import { hexToRgba } from "@/utils/colors";
import { styles } from "./PublicMenuScreen.styles";

type Load = { status: "loading" } | PublicMenuOutcome;

const BOOKING_PATH = "/locations" as Href;

/** What the scroll content leaves free for the booking bar pinned over the bottom of the page. */
const BOOK_BAR_CLEARANCE = 96;

/**
 * What a guest's phone opens from a QR code: `/menu/r/{token}` for the restaurant's, and
 * `/menu/t/{token}` for a table's. The token is the only handle the page holds, and the API
 * answers an unknown token, an archived location and an unpublished menu identically, so the
 * page has one "not available" state rather than three it could tell apart.
 *
 * Plain views and a lazy-loaded photo, no animation: it is read standing up, often on a phone
 * that is several years old.
 *
 * @see [PublicMenuScreen.test.tsx](../../tests/components/menu/PublicMenuScreen.test.tsx) —
 * pins the three outcomes, the table label, the menu switcher, the filters against the
 * rendered dishes, and the booking button.
 */
export function PublicMenuScreen({ kind, token }: { kind: PublicMenuKind; token: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, primaryColor } = useAppTheme();
  useRouteDefaultLocale(MENU_DEFAULT_LOCALE);

  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [menuIndex, setMenuIndex] = useState(0);
  const [filter, setFilter] = useMenuFilter();

  const fetchMenu = useCallback(() => {
    setLoad({ status: "loading" });
    let cancelled = false;
    fetchPublicMenu(kind, token).then((outcome) => {
      if (!cancelled) setLoad(outcome);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, token]);

  useEffect(() => fetchMenu(), [fetchMenu]);

  const restaurantName = load.status === "ok" ? load.menu.restaurant.name : null;
  useEffect(() => {
    if (Platform.OS === "web" && restaurantName) {
      document.title = t("restaurant.publicMenu.documentTitle", { name: restaurantName });
    }
  }, [restaurantName, t]);

  const goBook = () => router.push(BOOKING_PATH);

  if (load.status === "loading") {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator color={primaryColor} />
        <ThemedText style={[styles.centerText, { color: colors.muted }]}>
          {t("restaurant.publicMenu.loading")}
        </ThemedText>
      </ThemedView>
    );
  }

  if (load.status !== "ok") {
    const unavailable = load.status === "notFound";
    return (
      <ThemedView style={styles.center}>
        <Icon
          name={unavailable ? "restaurant-outline" : "cloud-offline-outline"}
          size={40}
          color={colors.muted}
        />
        <ThemedText type="h2" style={styles.centerTitle}>
          {unavailable
            ? t("restaurant.publicMenu.notFound.title")
            : t("restaurant.publicMenu.error.title")}
        </ThemedText>
        <ThemedText style={[styles.centerText, { color: colors.muted }]}>
          {unavailable
            ? t("restaurant.publicMenu.notFound.body")
            : t("restaurant.publicMenu.error.body")}
        </ThemedText>
        {!unavailable && (
          <Button size="md" onPress={fetchMenu}>
            {t("common.actions.tryAgain")}
          </Button>
        )}
      </ThemedView>
    );
  }

  const { restaurant, table, menus } = load.menu;
  const menu = menus[Math.min(menuIndex, menus.length - 1)];
  const categories = menu ? filterCategories(menu.categories, filter) : [];

  return (
    <ThemedView style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: BOOK_BAR_CLEARANCE + insets.bottom },
        ]}
      >
        <View style={styles.column}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <ThemedText type="h1" testID="menu-restaurant-name">
                {restaurant.name}
              </ThemedText>
              {table?.name ? (
                <View
                  style={[styles.tablePill, { backgroundColor: hexToRgba(primaryColor, 0.14) }]}
                >
                  <Icon name="restaurant-outline" size="md" color={primaryColor} />
                  <ThemedText style={[styles.tablePillText, { color: primaryColor }]}>
                    {t("restaurant.publicMenu.tableLabel", { name: table.name })}
                  </ThemedText>
                </View>
              ) : null}
            </View>
            <View style={styles.language}>
              <LanguageSwitcher />
            </View>
          </View>

          {menus.length > 1 && (
            <View style={styles.menuTabs} accessibilityRole="tablist">
              {menus.map((m, index) => {
                const selected = index === menuIndex;
                return (
                  <Pressable
                    key={`${index}-${m.name}`}
                    testID="menu-tab"
                    onPress={() => setMenuIndex(index)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    aria-selected={selected}
                    style={[
                      styles.menuTab,
                      { borderColor: selected ? primaryColor : colors.borderStrong },
                      selected && { backgroundColor: primaryColor },
                    ]}
                  >
                    <ThemedText
                      style={[styles.menuTabText, selected && { color: "#ffffff" }]}
                      numberOfLines={1}
                    >
                      {m.name}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          )}

          {menu?.description ? (
            <ThemedText style={[styles.menuDescription, { color: colors.muted }]}>
              {menu.description}
            </ThemedText>
          ) : null}

          <MenuFilters filter={filter} onChange={setFilter} />

          {categories.length === 0 ? (
            <ThemedText testID="menu-empty" style={[styles.empty, { color: colors.muted }]}>
              {isFilterActive(filter)
                ? t("restaurant.publicMenu.noMatch")
                : t("restaurant.publicMenu.emptyMenu")}
            </ThemedText>
          ) : (
            categories.map((category) => (
              <View key={category.name} style={styles.category} testID="menu-category">
                <ThemedText type="h2" style={styles.categoryName}>
                  {category.name}
                </ThemedText>
                {category.description ? (
                  <ThemedText style={[styles.categoryDescription, { color: colors.muted }]}>
                    {category.description}
                  </ThemedText>
                ) : null}
                {category.items.map((item, index) => (
                  <MenuItemRow key={`${index}-${item.name}`} item={item} currency={menu.currency} />
                ))}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <View
        style={[
          styles.bookBar,
          {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, 12),
          },
        ]}
      >
        <View style={styles.bookInner}>
          <Button size="lg" icon="calendar-outline" fullWidth onPress={goBook} testID="menu-book">
            {t("restaurant.publicMenu.bookCta")}
          </Button>
        </View>
      </View>
    </ThemedView>
  );
}
