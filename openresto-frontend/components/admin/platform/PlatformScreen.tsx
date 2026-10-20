import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import ConfirmModal from "@/components/common/ConfirmModal";
import { SettingsPage } from "@/components/admin/settings/SettingsPage";
import { useAppTheme } from "@/hooks/use-app-theme";
import { theme } from "@/theme/theme";
import {
  fetchPlatformRestaurants,
  reactivatePlatformRestaurant,
  type PlatformRestaurant,
} from "@/api/platform";
import { ConsentsModal } from "./ConsentsModal";
import { GuestDataModal } from "./GuestDataModal";
import { InvitationModal } from "./InvitationModal";
import { PlatformRestaurantRow, type PlatformRowAction } from "./PlatformRestaurantRow";
import { SuspendModal } from "./SuspendModal";
import { styles } from "./PlatformScreen.styles";

type Load =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; restaurants: PlatformRestaurant[] };

type Dialog = { kind: "add" } | { kind: PlatformRowAction; restaurant: PlatformRestaurant } | null;

/**
 * The platform's own space: every restaurant of the instance, where each stands, and the actions
 * only the platform has. Every action answers with the updated row (or, for an invitation, the
 * row inside its result), so the list is patched from the answer rather than refetched or guessed.
 *
 * It holds no guest data: the list is counts and dates, and the guest-data dialog keeps what it
 * fetches to itself and drops it on close.
 *
 * @see [PlatformScreen.test.tsx](../../../tests/components/admin/platform/PlatformScreen.test.tsx)
 * — pins the load states, each row action opening its own dialog, the list patched from an
 * answer, the suspend and reactivate paths, and that a refused reactivation is shown and leaves
 * the row as it was.
 */
export function PlatformScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoad({ status: "loading" });
    fetchPlatformRestaurants().then((result) =>
      setLoad(result.ok ? { status: "ready", restaurants: result.value } : { status: "error" })
    );
  }, []);

  useEffect(refresh, [refresh]);

  /** Replaces the row an action answered with, or appends it when it is a restaurant just added. */
  const upsert = useCallback((saved: PlatformRestaurant) => {
    setLoad((current) => {
      if (current.status !== "ready") return current;
      const known = current.restaurants.some((r) => r.id === saved.id);
      return {
        status: "ready",
        restaurants: known
          ? current.restaurants.map((r) => (r.id === saved.id ? saved : r))
          : [...current.restaurants, saved],
      };
    });
  }, []);

  const closeDialog = () => setDialog(null);

  const reactivate = async (restaurant: PlatformRestaurant) => {
    if (busy) return;
    setBusy(true);
    const result = await reactivatePlatformRestaurant(restaurant.id);
    setBusy(false);
    setDialog(null);
    if (result.ok) {
      setNotice(null);
      upsert(result.value);
    } else {
      setNotice(result.message);
    }
  };

  return (
    <SettingsPage title={t("admin.platform.title")} subtitle={t("admin.platform.subtitle")}>
      <ButtonRow align="start">
        <Button size="md" icon="add" onPress={() => setDialog({ kind: "add" })}>
          {t("admin.platform.addButton")}
        </Button>
      </ButtonRow>

      {notice && (
        <ThemedText style={{ color: theme.colors.error }} role="alert" testID="platform-notice">
          {notice}
        </ThemedText>
      )}

      {load.status === "loading" ? (
        <ActivityIndicator color={colors.muted} />
      ) : load.status === "error" ? (
        <View style={styles.errorBlock}>
          <ThemedText style={{ color: theme.colors.error }} role="alert">
            {t("admin.platform.loadFailed")}
          </ThemedText>
          <ButtonRow align="start">
            <Button variant="secondary" size="md" onPress={refresh}>
              {t("common.actions.tryAgain")}
            </Button>
          </ButtonRow>
        </View>
      ) : load.restaurants.length === 0 ? (
        <ThemedText style={{ color: colors.muted }} testID="platform-empty">
          {t("admin.platform.empty")}
        </ThemedText>
      ) : (
        <View style={styles.list} testID="platform-list">
          {load.restaurants.map((restaurant) => (
            <PlatformRestaurantRow
              key={restaurant.id}
              restaurant={restaurant}
              onAction={(kind, row) => setDialog({ kind, restaurant: row })}
            />
          ))}
        </View>
      )}

      {dialog?.kind === "add" && <InvitationModal onSaved={upsert} onClose={closeDialog} />}
      {dialog?.kind === "invite" && (
        <InvitationModal restaurant={dialog.restaurant} onSaved={upsert} onClose={closeDialog} />
      )}
      {dialog?.kind === "suspend" && (
        <SuspendModal restaurant={dialog.restaurant} onSaved={upsert} onClose={closeDialog} />
      )}
      {dialog?.kind === "consents" && (
        <ConsentsModal restaurant={dialog.restaurant} onClose={closeDialog} />
      )}
      {dialog?.kind === "guestData" && (
        <GuestDataModal restaurant={dialog.restaurant} onClose={closeDialog} />
      )}
      {dialog?.kind === "reactivate" && (
        <ConfirmModal
          visible
          title={t("admin.platform.reactivate.title", { name: dialog.restaurant.name })}
          message={t("admin.platform.reactivate.body")}
          confirmLabel={t("admin.platform.reactivate.confirm")}
          loading={busy}
          onConfirm={() => reactivate(dialog.restaurant)}
          onCancel={closeDialog}
        />
      )}
    </SettingsPage>
  );
}

export default PlatformScreen;
