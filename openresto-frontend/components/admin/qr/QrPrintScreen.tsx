import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { QrSheet, type QrSheetCell, type QrSheetFormat } from "@/components/admin/qr/QrSheet";
import { adminGetPublicTokens, type PublicTokens } from "@/api/menus";
import { adminGetRestaurants } from "@/api/admin";
import { useBrand } from "@/context/BrandContext";
import { useAppTheme } from "@/hooks/use-app-theme";
import { menuUrl, qrBaseUrl, qrToSvg } from "@/utils/qrCode";

type Load =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; name: string; tokens: PublicTokens };

const QR_PATH = "/admin/qr-codes" as Href;

/**
 * The route behind the Print buttons: `?restaurant=<id>&format=a4|a6&scope=tables|restaurant`.
 * It draws no admin chrome (the layout leaves the sidebar off this path), because a sheet that
 * is printed from the browser would otherwise carry the navigation along with it.
 *
 * @see [QrPrintScreen.test.tsx](../../../tests/components/admin/qr/QrPrintScreen.test.tsx) —
 * pins that tables and the restaurant code each become the right cells, that an unknown
 * location or a failed load says so instead of printing an empty sheet, and that format and
 * scope fall back to A4 tables when the address is mangled.
 */
export function QrPrintScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const brand = useBrand();
  const { colors } = useAppTheme();
  const params = useLocalSearchParams<{ restaurant?: string; format?: string; scope?: string }>();
  const restaurantId = Number(params.restaurant);
  const format: QrSheetFormat = params.format === "a6" ? "a6" : "a4";
  const scope = params.scope === "restaurant" ? "restaurant" : "tables";
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: "loading" });
    Promise.all([adminGetRestaurants(), adminGetPublicTokens(restaurantId)]).then(
      ([restaurants, tokens]) => {
        if (cancelled) return;
        const name = restaurants.find((r) => r.id === restaurantId)?.name;
        setLoad(
          name && tokens.ok ? { status: "ready", name, tokens: tokens.value } : { status: "error" }
        );
      }
    );
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const cells = useMemo<QrSheetCell[]>(() => {
    if (load.status !== "ready") return [];
    const base = qrBaseUrl(brand.websiteUrl, window.location.origin);
    if (scope === "restaurant") {
      return [
        {
          key: "restaurant",
          svg: qrToSvg(menuUrl(base, "r", load.tokens.restaurantToken)),
          label: t("admin.qrCodes.sheet.restaurantLabel"),
        },
      ];
    }
    return load.tokens.tables.map((table) => ({
      key: `table-${table.tableId}`,
      svg: qrToSvg(menuUrl(base, "t", table.token)),
      label: table.tableName
        ? t("admin.qrCodes.tableNamed", { name: table.tableName })
        : t("admin.qrCodes.tableFallback", { id: table.tableId }),
      caption: table.sectionName,
    }));
  }, [load, scope, brand.websiteUrl, t]);

  if (load.status === "loading") {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.muted} />
      </ThemedView>
    );
  }

  if (load.status === "error" || cells.length === 0) {
    return (
      <ThemedView style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <ThemedText style={{ color: colors.muted, textAlign: "center" }} role="alert">
          {t("admin.qrCodes.sheet.unavailable")}
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <QrSheet
      restaurantName={load.name}
      format={format}
      cells={cells}
      labels={{
        scan: t("admin.qrCodes.sheet.scan"),
        noApp: t("admin.qrCodes.sheet.noApp"),
        print: t("admin.qrCodes.sheet.print"),
        back: t("admin.qrCodes.sheet.back"),
        hint: t(`admin.qrCodes.sheet.hint${format === "a4" ? "A4" : "A6"}`),
      }}
      onBack={() => router.push(QR_PATH)}
    />
  );
}
