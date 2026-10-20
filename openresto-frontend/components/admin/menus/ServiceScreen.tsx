import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { Stack, useRouter, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import Input from "@/components/common/Input";
import { Icon } from "@/components/common/Icon";
import { LocationPills } from "@/components/admin/locations/LocationPills";
import { FilterChip } from "@/components/menu/MenuFilters";
import { usePriceLabel } from "@/components/menu/MenuItemRow";
import {
  adminListMenus,
  adminSetItemAvailability,
  type MenuDto,
  type MenuItemDto,
} from "@/api/menus";
import { useAdminLocation } from "@/hooks/use-admin-location";
import { useAppTheme } from "@/hooks/use-app-theme";
import { haptics } from "@/utils/haptics";
import { replaceItem } from "@/utils/menuState";
import { theme } from "@/theme/theme";
import { styles } from "./ServiceScreen.styles";

const MENUS_PATH = "/admin/menus" as Href;

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; menus: MenuDto[] };

/**
 * The screen to keep open on a phone during service: every dish of the published menus on one
 * scrolling list, each a single large press that flips it between available and sold out. The
 * flip shows at once and is taken back, with a message, if the server refuses it, so a flaky
 * kitchen wifi never leaves the screen claiming a dish is off when the guests can still order it.
 *
 * Only published menus are listed, and hidden dishes are left out: both are invisible to guests,
 * so neither has a sold-out state worth flipping mid-service.
 *
 * @see [ServiceScreen.test.tsx](../../../tests/components/admin/menus/ServiceScreen.test.tsx) —
 * pins the optimistic flip and its rollback, the sold-out-only filter, the search, and that
 * unpublished menus and hidden dishes are not listed.
 */
export function ServiceScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, primaryColor } = useAppTheme();
  const priceLabel = usePriceLabel();
  const { restaurants, loading, selected, select } = useAdminLocation();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [soldOutOnly, setSoldOutOnly] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // A dish with a flip in flight ignores further presses: two writes racing for one dish would
  // leave the server holding whichever happened to land last, not the one the screen shows.
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());

  const restaurantId = selected?.id ?? null;

  useEffect(() => {
    if (restaurantId === null) return;
    let cancelled = false;
    setLoad({ status: "loading" });
    adminListMenus(restaurantId).then((result) => {
      if (cancelled) return;
      setLoad(result.ok ? { status: "ready", menus: result.value } : { status: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const patch = useCallback((fn: (menus: MenuDto[]) => MenuDto[]) => {
    setLoad((current) =>
      current.status === "ready" ? { status: "ready", menus: fn(current.menus) } : current
    );
  }, []);

  const toggle = async (item: MenuItemDto) => {
    if (restaurantId === null || pending.has(item.id)) return;
    const next = item.availability === "SoldOut" ? "Available" : "SoldOut";
    setFailure(null);
    haptics.press();
    setPending((ids) => new Set(ids).add(item.id));
    patch((menus) => replaceItem(menus, { ...item, availability: next }));
    const result = await adminSetItemAvailability(restaurantId, item, next);
    setPending((ids) => {
      const rest = new Set(ids);
      rest.delete(item.id);
      return rest;
    });
    if (result.ok) {
      patch((menus) => replaceItem(menus, result.value));
    } else {
      patch((menus) => replaceItem(menus, item));
      setFailure(t("admin.menus.service.updateFailed", { name: item.name }));
    }
  };

  const published = useMemo(
    () => (load.status === "ready" ? load.menus.filter((menu) => menu.isPublished) : []),
    [load]
  );
  const soldOutCount = published.reduce(
    (total, menu) =>
      total +
      menu.categories.reduce(
        (sum, category) =>
          sum + category.items.filter((item) => item.availability === "SoldOut").length,
        0
      ),
    0
  );
  const needle = query.trim().toLocaleLowerCase();
  const matches = (item: MenuItemDto) =>
    item.availability !== "Hidden" &&
    (!soldOutOnly || item.availability === "SoldOut") &&
    (!needle || item.name.toLocaleLowerCase().includes(needle));

  const listed = published
    .map((menu) => ({
      menu,
      categories: menu.categories
        .map((category) => ({ category, items: category.items.filter(matches) }))
        .filter(({ items }) => items.length > 0),
    }))
    .filter(({ categories }) => categories.length > 0);

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: t("admin.menus.service.title") }} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.column}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <ThemedText type="h1">{t("admin.menus.service.title")}</ThemedText>
              <ThemedText style={{ color: colors.muted }}>
                {t("admin.menus.service.subtitle")}
              </ThemedText>
            </View>
            <Pressable
              onPress={() => router.push(MENUS_PATH)}
              accessibilityRole="link"
              testID="service-back"
              style={styles.back}
            >
              <ThemedText style={[styles.backText, { color: primaryColor }]}>
                {t("admin.menus.service.editMenus")}
              </ThemedText>
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.muted} />
          ) : !selected ? (
            <ThemedText style={{ color: colors.muted }}>{t("admin.menus.noLocations")}</ThemedText>
          ) : (
            <>
              {restaurants.length > 1 && (
                <LocationPills
                  restaurants={restaurants}
                  selectedId={selected.id}
                  onSelect={select}
                />
              )}

              <Input
                value={query}
                onChangeText={setQuery}
                placeholder={t("admin.menus.service.search")}
                accessibilityLabel={t("admin.menus.service.search")}
                autoCapitalize="none"
                autoCorrect={false}
                testID="service-search"
              />
              <View style={styles.filters}>
                <FilterChip
                  role="radio"
                  testID="service-filter-all"
                  label={t("admin.menus.service.filterAll")}
                  selected={!soldOutOnly}
                  onPress={() => setSoldOutOnly(false)}
                />
                <FilterChip
                  role="radio"
                  testID="service-filter-sold-out"
                  label={t("admin.menus.service.filterSoldOut", { count: soldOutCount })}
                  selected={soldOutOnly}
                  onPress={() => setSoldOutOnly(true)}
                />
              </View>

              {failure && (
                <ThemedText style={[styles.failure, { color: colors.error }]} role="alert">
                  {failure}
                </ThemedText>
              )}

              {load.status === "loading" ? (
                <ActivityIndicator color={colors.muted} />
              ) : load.status === "error" ? (
                <ThemedText style={{ color: colors.error }} role="alert">
                  {t("admin.menus.couldntLoad")}
                </ThemedText>
              ) : published.length === 0 ? (
                <ThemedText style={{ color: colors.muted }}>
                  {t("admin.menus.service.nothingPublished")}
                </ThemedText>
              ) : listed.length === 0 ? (
                <ThemedText style={{ color: colors.muted }}>
                  {t("admin.menus.service.noMatch")}
                </ThemedText>
              ) : (
                listed.map(({ menu, categories }) => (
                  <View key={menu.id} style={styles.menu}>
                    {published.length > 1 && (
                      <ThemedText type="h2" style={styles.menuName}>
                        {menu.name}
                      </ThemedText>
                    )}
                    {categories.map(({ category, items }) => (
                      <View key={category.id} style={styles.category}>
                        <ThemedText style={[styles.categoryName, { color: colors.muted }]}>
                          {category.name}
                        </ThemedText>
                        {items.map((item) => {
                          const soldOut = item.availability === "SoldOut";
                          return (
                            <Pressable
                              key={item.id}
                              testID={`service-item-${item.id}`}
                              onPress={() => toggle(item)}
                              accessibilityRole="switch"
                              accessibilityLabel={item.name}
                              accessibilityState={{ checked: soldOut }}
                              style={[
                                styles.row,
                                {
                                  backgroundColor: colors.card,
                                  borderColor: soldOut ? theme.colors.warning : colors.border,
                                },
                              ]}
                            >
                              <View style={styles.rowText}>
                                <ThemedText
                                  style={[styles.rowName, soldOut && styles.soldOutName]}
                                  numberOfLines={2}
                                >
                                  {item.name}
                                </ThemedText>
                                <ThemedText style={[styles.rowPrice, { color: colors.muted }]}>
                                  {priceLabel(item.priceMinor, menu.currency)}
                                </ThemedText>
                              </View>
                              <View
                                style={[
                                  styles.state,
                                  soldOut
                                    ? { backgroundColor: theme.colors.warning }
                                    : { backgroundColor: theme.badge.active.bg },
                                ]}
                              >
                                <Icon
                                  name={soldOut ? "close-circle" : "checkmark-circle"}
                                  size="lg"
                                  color={soldOut ? "#1f2937" : theme.badge.active.text}
                                />
                                <ThemedText
                                  style={[
                                    styles.stateText,
                                    { color: soldOut ? "#1f2937" : theme.badge.active.text },
                                  ]}
                                >
                                  {soldOut
                                    ? t("common.menu.availability.SoldOut")
                                    : t("common.menu.availability.Available")}
                                </ThemedText>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                ))
              )}
            </>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}
