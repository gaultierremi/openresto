import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, useWindowDimensions, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import { LocationPills } from "@/components/admin/locations/LocationPills";
import { SettingsPage } from "@/components/admin/settings/SettingsPage";
import { SPLIT_MIN_WIDTH } from "@/components/admin/settings/settings.styles";
import { SiteGalleryCard } from "@/components/admin/site/SiteGalleryCard";
import { SiteImagesCard } from "@/components/admin/site/SiteImagesCard";
import { SitePreview } from "@/components/admin/site/SitePreview";
import { SitePublishCard } from "@/components/admin/site/SitePublishCard";
import { SiteSettingsCard } from "@/components/admin/site/SiteSettingsCard";
import { adminGetSite, type SiteDto } from "@/api/site";
import { useAdminLocation } from "@/hooks/use-admin-location";
import { useAppTheme } from "@/hooks/use-app-theme";
import type { SiteTheme } from "@/constants/site";
import { styles } from "./SiteScreen.styles";

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; site: SiteDto };

/**
 * "Mon site": pick a location, then publish, style and fill in its one-page website. The site is
 * fetched once per location and replaced whole by each call's answer, because every call
 * answers with the whole site. The preview sits beside the form on a wide viewport and after it
 * on a narrower one, so a form the admin cannot reach is never pushed below a frame.
 *
 * @see [SiteScreen.test.tsx](../../../tests/components/admin/site/SiteScreen.test.tsx) — pins
 * the load states, the location switch, the preview following the chosen theme, and the layout
 * on either side of the split width.
 */
export function SiteScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const { restaurants, loading, selected, select } = useAdminLocation();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [shownTheme, setShownTheme] = useState<SiteTheme>("Brasserie");

  const restaurantId = selected?.id ?? null;

  useEffect(() => {
    if (restaurantId === null) return;
    let cancelled = false;
    setLoad({ status: "loading" });
    adminGetSite(restaurantId).then((result) => {
      if (cancelled) return;
      if (result.ok) setShownTheme(result.value.theme);
      setLoad(result.ok ? { status: "ready", site: result.value } : { status: "error" });
    });
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  const onSite = useCallback((site: SiteDto) => {
    setLoad((current) => (current.status === "ready" ? { status: "ready", site } : current));
  }, []);

  const split = width >= SPLIT_MIN_WIDTH;
  const preview =
    restaurantId !== null && load.status === "ready" ? (
      <SitePreview restaurantId={restaurantId} theme={shownTheme} version={load.site.updatedAt} />
    ) : null;

  return (
    <SettingsPage
      title={t("admin.site.title")}
      subtitle={t("admin.site.subtitle")}
      aside={split ? (preview ?? undefined) : undefined}
    >
      {loading ? (
        <ActivityIndicator color={colors.muted} />
      ) : !selected ? (
        <ThemedText style={[styles.empty, { color: colors.muted }]}>
          {t("admin.site.noLocations")}
        </ThemedText>
      ) : (
        <>
          {restaurants.length > 1 && (
            <LocationPills restaurants={restaurants} selectedId={selected.id} onSelect={select} />
          )}

          {load.status === "loading" ? (
            <ActivityIndicator color={colors.muted} />
          ) : load.status === "error" ? (
            <ThemedText style={{ color: colors.error }} role="alert">
              {t("admin.site.couldntLoad")}
            </ThemedText>
          ) : (
            <View style={styles.stack} key={selected.id} testID="site-stack">
              <SitePublishCard restaurantId={selected.id} site={load.site} onSite={onSite} />
              <SiteSettingsCard
                restaurantId={selected.id}
                site={load.site}
                onSite={onSite}
                onThemeChange={setShownTheme}
              />
              <SiteImagesCard restaurantId={selected.id} site={load.site} onSite={onSite} />
              <SiteGalleryCard restaurantId={selected.id} site={load.site} onSite={onSite} />
              {!split && preview}
            </View>
          )}
        </>
      )}
    </SettingsPage>
  );
}
