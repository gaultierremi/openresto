import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import { LocationPills } from "@/components/admin/locations/LocationPills";
import { AddEntryForm } from "@/components/admin/menus/AddEntryForm";
import { MenuCard } from "@/components/admin/menus/MenuCard";
import { SettingsPage } from "@/components/admin/settings/SettingsPage";
import {
  adminCreateMenu,
  adminGetPublicTokens,
  adminListMenus,
  adminReorderMenus,
  type MenuDto,
} from "@/api/menus";
import { useAdminLocation } from "@/hooks/use-admin-location";
import { useAppTheme } from "@/hooks/use-app-theme";
import { openExternal } from "@/utils/openExternal";
import { menuUrl } from "@/utils/qrCode";
import { moveId } from "@/utils/reorder";
import { newMenuCurrency, reorderMenus } from "@/utils/menuState";
import { styles } from "./MenusScreen.styles";

const SERVICE_PATH = "/admin/menus/service" as Href;
const QR_PATH = "/admin/qr-codes" as Href;

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; menus: MenuDto[] };

/**
 * The admin's menu editor: pick a location, then its menus, categories and dishes. The tree is
 * fetched once per location and patched in place as each call lands (see `utils/menuState.ts`).
 *
 * @see [MenusScreen.test.tsx](../../../tests/components/admin/menus/MenusScreen.test.tsx) —
 * pins the load states, the menu creation, the reorder with its rollback, and the links to the
 * service screen, the QR codes and the public page.
 */
export function MenusScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useAppTheme();
  const { restaurants, loading, selected, select } = useAdminLocation();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [justAdded, setJustAdded] = useState<number | null>(null);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

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

  const patchTree = useCallback((patch: (menus: MenuDto[]) => MenuDto[]) => {
    setLoad((current) =>
      current.status === "ready" ? { status: "ready", menus: patch(current.menus) } : current
    );
  }, []);

  const openPublicPage = async (id: number) => {
    const result = await adminGetPublicTokens(id);
    if (!result.ok) return setProblem(result.message);
    openExternal(menuUrl(window.location.origin, "r", result.value.restaurantToken));
  };

  const addMenu = async (id: number, menus: MenuDto[], name: string): Promise<string | null> => {
    const result = await adminCreateMenu(id, {
      name,
      description: null,
      currency: newMenuCurrency(menus),
    });
    if (!result.ok) return result.message;
    setJustAdded(result.value.id);
    patchTree((menus) => [...menus, result.value]);
    return null;
  };

  const moveMenu = async (id: number, menus: MenuDto[], index: number, direction: -1 | 1) => {
    const before = menus.map((menu) => menu.id);
    const after = moveId(before, index, direction);
    if (!after) return;
    setReorderBusy(true);
    setProblem(null);
    patchTree((current) => reorderMenus(current, after));
    const result = await adminReorderMenus(id, after);
    setReorderBusy(false);
    if (!result.ok) {
      patchTree((current) => reorderMenus(current, before));
      setProblem(result.message);
    }
  };

  return (
    <SettingsPage title={t("admin.menus.title")} subtitle={t("admin.menus.subtitle")}>
      {loading ? (
        <ActivityIndicator color={colors.muted} />
      ) : !selected ? (
        <ThemedText style={{ color: colors.muted }}>{t("admin.menus.noLocations")}</ThemedText>
      ) : (
        <>
          {restaurants.length > 1 && (
            <LocationPills restaurants={restaurants} selectedId={selected.id} onSelect={select} />
          )}

          <ButtonRow align="start">
            <Button
              size="md"
              variant="secondary"
              icon="flash-outline"
              onPress={() => router.push(SERVICE_PATH)}
              testID="menus-service-link"
            >
              {t("admin.menus.actions.service")}
            </Button>
            <Button
              size="md"
              variant="secondary"
              icon="qr-code-outline"
              onPress={() => router.push(QR_PATH)}
              testID="menus-qr-link"
            >
              {t("admin.menus.actions.qrCodes")}
            </Button>
            <Button
              size="md"
              variant="secondary"
              icon="open-outline"
              onPress={() => openPublicPage(selected.id)}
              testID="menus-public-link"
            >
              {t("admin.menus.actions.viewPublic")}
            </Button>
          </ButtonRow>

          {problem && (
            <ThemedText style={[styles.error, { color: colors.error }]} role="alert">
              {problem}
            </ThemedText>
          )}

          {load.status === "loading" ? (
            <ActivityIndicator color={colors.muted} />
          ) : load.status === "error" ? (
            <ThemedText style={{ color: colors.error }} role="alert">
              {t("admin.menus.couldntLoad")}
            </ThemedText>
          ) : (
            <View style={styles.list}>
              {load.menus.length === 0 && (
                <ThemedText style={[styles.empty, { color: colors.muted }]}>
                  {t("admin.menus.empty")}
                </ThemedText>
              )}
              {load.menus.map((menu, index) => (
                <MenuCard
                  key={menu.id}
                  restaurantId={selected.id}
                  menu={menu}
                  isFirst={index === 0}
                  isLast={index === load.menus.length - 1}
                  reorderBusy={reorderBusy}
                  onMove={(direction) => moveMenu(selected.id, load.menus, index, direction)}
                  onTree={patchTree}
                  defaultOpen={menu.id === justAdded}
                />
              ))}
              <AddEntryForm
                label={t("admin.menus.addMenu")}
                placeholder={t("admin.menus.addMenuPlaceholder")}
                onAdd={(name) => addMenu(selected.id, load.menus, name)}
                testID="add-menu"
              />
            </View>
          )}
        </>
      )}
    </SettingsPage>
  );
}
