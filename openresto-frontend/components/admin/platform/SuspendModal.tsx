import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import { ModalCard } from "@/components/common/ModalCard";
import { useAppTheme } from "@/hooks/use-app-theme";
import { theme } from "@/theme/theme";
import { suspendPlatformRestaurant, type PlatformRestaurant } from "@/api/platform";
import { MAX_SUSPENSION_REASON_LENGTH } from "@/constants/platform";
import { styles } from "./modal.styles";

/**
 * Suspending a restaurant takes it off the guests' side at once, so it is two steps: the reason
 * (optional, and shown to the restaurateur) and then an explicit confirmation. Nothing is sent
 * until the second one is accepted; backing out of it, or dismissing the dialog, sends nothing.
 * A refusal from the server is shown on the confirmation and the restaurant is left as it was.
 *
 * @see [SuspendModal.test.tsx](../../../tests/components/admin/platform/SuspendModal.test.tsx) —
 * pins that no call is made before the confirmation, that a blank reason is sent as none, and
 * that a refusal is shown with the row left untouched.
 */
export function SuspendModal({
  restaurant,
  onSaved,
  onClose,
}: {
  restaurant: PlatformRestaurant;
  onSaved: (restaurant: PlatformRestaurant) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    const result = await suspendPlatformRestaurant(restaurant.id, reason.trim() || null);
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onSaved(result.value);
    onClose();
  };

  return (
    <ModalCard
      visible
      alert={confirming}
      title={
        confirming
          ? t("admin.platform.suspend.confirmTitle", { name: restaurant.name })
          : t("admin.platform.suspend.title", { name: restaurant.name })
      }
      onDismiss={onClose}
      dismissLabel={t("common.actions.cancel")}
      testID="suspend-modal"
    >
      {confirming ? (
        <>
          <ThemedText style={[styles.intro, { color: colors.muted }]}>
            {t("admin.platform.suspend.confirmBody")}
          </ThemedText>
          {error && (
            <ThemedText
              style={[styles.error, { color: theme.colors.error }]}
              role="alert"
              testID="suspend-error"
            >
              {error}
            </ThemedText>
          )}
          <View style={[styles.actions, { borderTopColor: colors.border }]}>
            <Button
              variant="secondary"
              tone="neutral"
              size="md"
              onPress={() => {
                setError(null);
                setConfirming(false);
              }}
            >
              {t("admin.platform.suspend.back")}
            </Button>
            <Button variant="danger" size="md" loading={busy} onPress={confirm}>
              {t("admin.platform.suspend.confirm")}
            </Button>
          </View>
        </>
      ) : (
        <>
          <ThemedText style={[styles.intro, { color: colors.muted }]}>
            {t("admin.platform.suspend.intro")}
          </ThemedText>
          <View style={styles.field}>
            <ThemedText style={styles.label}>{t("admin.platform.suspend.reasonLabel")}</ThemedText>
            <Input
              value={reason}
              onChangeText={setReason}
              maxLength={MAX_SUSPENSION_REASON_LENGTH}
              multiline
              style={styles.multiline}
              accessibilityLabel={t("admin.platform.suspend.reasonLabel")}
            />
            <ThemedText style={[styles.counter, { color: colors.muted }]} testID="suspend-counter">
              {t("admin.platform.suspend.counter", {
                count: reason.length,
                max: MAX_SUSPENSION_REASON_LENGTH,
              })}
            </ThemedText>
            <ThemedText style={[styles.hint, { color: colors.muted }]}>
              {t("admin.platform.suspend.reasonHint")}
            </ThemedText>
          </View>
          <View style={[styles.actions, { borderTopColor: colors.border }]}>
            <Button variant="secondary" tone="neutral" size="md" onPress={onClose}>
              {t("common.actions.cancel")}
            </Button>
            <Button variant="danger" size="md" onPress={() => setConfirming(true)}>
              {t("admin.platform.suspend.next")}
            </Button>
          </View>
        </>
      )}
    </ModalCard>
  );
}

export default SuspendModal;
