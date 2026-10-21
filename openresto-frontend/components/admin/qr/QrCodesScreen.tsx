import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import { LocationPills } from "@/components/admin/locations/LocationPills";
import { QrTile } from "@/components/admin/qr/QrTile";
import { SettingsPage } from "@/components/admin/settings/SettingsPage";
import {
  adminGetPublicTokens,
  adminRegenerateRestaurantToken,
  adminRegenerateTableToken,
  type PublicTokens,
  type TablePublicToken,
} from "@/api/menus";
import { useCan } from "@/context/AuthContext";
import { useBrand } from "@/context/BrandContext";
import { useAdminLocation } from "@/hooks/use-admin-location";
import { useAppTheme } from "@/hooks/use-app-theme";
import { menuUrl, qrBaseUrl } from "@/utils/qrCode";
import { styles } from "./QrCodesScreen.styles";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; tokens: PublicTokens };

export const PRINT_PATH = "/admin/qr-codes/print";

/** The print route's address for a location, a sheet format and what goes on it. */
export function printHref(
  restaurantId: number,
  format: "a4" | "a6",
  scope: "tables" | "restaurant"
): Href {
  return `${PRINT_PATH}?restaurant=${restaurantId}&format=${format}&scope=${scope}` as Href;
}

/**
 * The QR page: one code for the restaurant and one per table, each downloadable, plus the print
 * sheets. The address a code carries is the instance's configured website when there is one and
 * the origin the admin is open on otherwise; it is printed under every code so an owner can see
 * where a guest's phone will be sent before paying for the print run.
 *
 * @see [QrCodesScreen.test.tsx](../../../tests/components/admin/qr/QrCodesScreen.test.tsx) —
 * pins the codes for the restaurant and each table, the address they carry, the print links,
 * that regenerating swaps the token on screen, and that a Manager is not offered it.
 */
export function QrCodesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const brand = useBrand();
  const { colors } = useAppTheme();
  const canRegenerate = useCan("regenerate:qr-token");
  const { restaurants, loading, selected, select } = useAdminLocation();
  const [load, setLoad] = useState<Load>({ status: "loading" });

  const restaurantId = selected?.id ?? null;

  useEffect(() => {
    if (restaurantId === null) return;
    let cancelled = false;
    setLoad({ status: "loading" });
    adminGetPublicTokens(restaurantId).then((result) => {
      if (cancelled) return;
      setLoad(result.ok ? { status: "ready", tokens: result.value } : { status: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const base = qrBaseUrl(brand.websiteUrl, window.location.origin);

  const replaceTokens = (next: (tokens: PublicTokens) => PublicTokens) =>
    setLoad((current) =>
      current.status === "ready" ? { status: "ready", tokens: next(current.tokens) } : current
    );

  const regenerateRestaurant = async (id: number): Promise<string | null> => {
    const result = await adminRegenerateRestaurantToken(id);
    if (!result.ok) return result.message;
    replaceTokens((tokens) => ({ ...tokens, restaurantToken: result.value }));
    return null;
  };

  const regenerateTable = async (id: number, tableId: number): Promise<string | null> => {
    const result = await adminRegenerateTableToken(id, tableId);
    if (!result.ok) return result.message;
    replaceTokens((tokens) => ({
      ...tokens,
      tables: tokens.tables.map((table) =>
        table.tableId === tableId ? { ...table, token: result.value } : table
      ),
    }));
    return null;
  };

  const tableTitle = (table: TablePublicToken) =>
    table.tableName
      ? t("admin.qrCodes.tableNamed", { name: table.tableName })
      : t("admin.qrCodes.tableFallback", { id: table.tableId });

  return (
    <SettingsPage title={t("admin.qrCodes.title")} subtitle={t("admin.qrCodes.subtitle")}>
      {loading ? (
        <ActivityIndicator color={colors.muted} />
      ) : !selected ? (
        <ThemedText style={{ color: colors.muted }}>{t("admin.qrCodes.noLocations")}</ThemedText>
      ) : (
        <>
          {restaurants.length > 1 && (
            <LocationPills restaurants={restaurants} selectedId={selected.id} onSelect={select} />
          )}

          {load.status === "loading" ? (
            <ActivityIndicator color={colors.muted} />
          ) : load.status === "error" ? (
            <ThemedText style={{ color: colors.error }} role="alert">
              {t("admin.qrCodes.couldntLoad")}
            </ThemedText>
          ) : (
            <>
              <View style={styles.section}>
                <ThemedText type="h2">{t("admin.qrCodes.restaurant.title")}</ThemedText>
                <ThemedText style={[styles.lead, { color: colors.muted }]}>
                  {t("admin.qrCodes.restaurant.description")}
                </ThemedText>
                <QrTile
                  testID="qr-restaurant"
                  title={selected.name}
                  url={menuUrl(base, "r", load.tokens.restaurantToken)}
                  fileBase={[selected.name]}
                  canRegenerate={canRegenerate}
                  onRegenerate={() => regenerateRestaurant(selected.id)}
                />
                <ButtonRow align="start">
                  <Button
                    size="md"
                    variant="secondary"
                    icon="print-outline"
                    onPress={() => router.push(printHref(selected.id, "a6", "restaurant"))}
                    testID="qr-print-restaurant"
                  >
                    {t("admin.qrCodes.printRestaurant")}
                  </Button>
                </ButtonRow>
              </View>

              <View style={styles.section}>
                <ThemedText type="h2">{t("admin.qrCodes.tables.title")}</ThemedText>
                <ThemedText style={[styles.lead, { color: colors.muted }]}>
                  {t("admin.qrCodes.tables.description")}
                </ThemedText>
                {load.tokens.tables.length === 0 ? (
                  <ThemedText style={{ color: colors.muted }}>
                    {t("admin.qrCodes.tables.empty")}
                  </ThemedText>
                ) : (
                  <>
                    <ButtonRow align="start">
                      <Button
                        size="md"
                        icon="print-outline"
                        onPress={() => router.push(printHref(selected.id, "a4", "tables"))}
                        testID="qr-print-a4"
                      >
                        {t("admin.qrCodes.printA4")}
                      </Button>
                      <Button
                        size="md"
                        variant="secondary"
                        icon="print-outline"
                        onPress={() => router.push(printHref(selected.id, "a6", "tables"))}
                        testID="qr-print-a6"
                      >
                        {t("admin.qrCodes.printA6")}
                      </Button>
                    </ButtonRow>
                    {load.tokens.tables.map((table) => (
                      <QrTile
                        key={table.tableId}
                        testID={`qr-table-${table.tableId}`}
                        title={tableTitle(table)}
                        subtitle={table.sectionName}
                        url={menuUrl(base, "t", table.token)}
                        fileBase={[selected.name, tableTitle(table)]}
                        canRegenerate={canRegenerate}
                        onRegenerate={() => regenerateTable(selected.id, table.tableId)}
                      />
                    ))}
                  </>
                )}
              </View>
            </>
          )}
        </>
      )}
    </SettingsPage>
  );
}
