import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import { Icon } from "@/components/common/Icon";
import Input from "@/components/common/Input";
import { ModalCard } from "@/components/common/ModalCard";
import { useAppTheme } from "@/hooks/use-app-theme";
import { theme } from "@/theme/theme";
import { setPlatformRetention, type PlatformRestaurant } from "@/api/platform";
import {
  DEFAULT_RETENTION_MONTHS,
  MAX_RETENTION_MONTHS,
  MIN_RETENTION_MONTHS,
} from "@/constants/onboarding";
import { parseRetention } from "@/utils/onboardingInfo";
import { styles as modalStyles } from "./modal.styles";
import { styles } from "./RetentionModal.styles";

/** The code of the server's refusal of a period outside the range this dialog already checks. */
const RETENTION_INVALID_CODE = "platform.retention_invalid";

type Mode = "period" | "none";

/**
 * How long a restaurant's guests stay identifiable: a period of 1 to 60 months, or no automatic
 * erasure at all, which is where every restaurant that predates the setting starts. It is the
 * platform's way of settling an existing establishment, since the restaurateur's own assistant
 * only reaches the ones it created.
 *
 * The period is checked before the call, by the button being off and again by the handler, since
 * a disabled button is not a gate. Nothing is sent for a period outside the range, and a refusal
 * from the server is shown in the dialog with the row left as it was.
 *
 * @see [RetentionModal.test.tsx](../../../tests/components/admin/platform/RetentionModal.test.tsx)
 * — pins both ends of the 1 to 60 range on each side, that the handler refuses on its own,
 * that "no automatic erasure" sends null, and that a refusal is shown with nothing handed up.
 */
export function RetentionModal({
  restaurant,
  onSaved,
  onClose,
}: {
  restaurant: PlatformRestaurant;
  onSaved: (restaurant: PlatformRestaurant) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors, primaryColor } = useAppTheme();
  const current = restaurant.bookingRetentionMonths;
  const [mode, setMode] = useState<Mode>(current === null ? "none" : "period");
  const [months, setMonths] = useState(String(current ?? DEFAULT_RETENTION_MONTHS));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rangeMessage = t("errors.onboarding.retention_invalid", {
    min: MIN_RETENTION_MONTHS,
    max: MAX_RETENTION_MONTHS,
  });
  const parsed = parseRetention(months);
  const invalid = mode === "period" && parsed === null;

  const save = async () => {
    if (busy) return;
    if (invalid) {
      setError(rangeMessage);
      return;
    }
    setError(null);
    setBusy(true);
    const result = await setPlatformRetention(restaurant.id, mode === "none" ? null : parsed);
    setBusy(false);
    if (!result.ok) {
      setError(result.code === RETENTION_INVALID_CODE ? rangeMessage : result.message);
      return;
    }
    onSaved(result.value);
    onClose();
  };

  const option = (value: Mode, label: string) => {
    const checked = mode === value;
    return (
      <Pressable
        onPress={() => setMode(value)}
        accessibilityRole="radio"
        accessibilityLabel={label}
        accessibilityState={{ checked }}
        style={[
          styles.option,
          { borderColor: checked ? primaryColor : colors.border, backgroundColor: colors.card },
        ]}
      >
        <Icon
          name={checked ? "radio-button-on" : "radio-button-off"}
          size="md"
          color={checked ? primaryColor : colors.muted}
        />
        <ThemedText style={styles.optionText}>{label}</ThemedText>
      </Pressable>
    );
  };

  return (
    <ModalCard
      visible
      title={t("admin.platform.retention.title", { name: restaurant.name })}
      onDismiss={onClose}
      dismissLabel={t("common.actions.cancel")}
      testID="retention-modal"
    >
      <ThemedText style={[modalStyles.intro, { color: colors.muted }]}>
        {t("admin.platform.retention.intro")}
      </ThemedText>

      <View
        role="radiogroup"
        accessibilityLabel={t("admin.platform.retention.optionsLabel")}
        style={styles.options}
      >
        {option("period", t("admin.platform.retention.periodOption"))}
        {option("none", t("admin.platform.retention.noneOption"))}
      </View>

      {mode === "period" ? (
        <View style={modalStyles.field}>
          <ThemedText style={modalStyles.label}>
            {t("admin.platform.retention.monthsLabel", {
              min: MIN_RETENTION_MONTHS,
              max: MAX_RETENTION_MONTHS,
            })}
          </ThemedText>
          <Input
            value={months}
            onChangeText={setMonths}
            keyboardType="number-pad"
            maxLength={3}
            style={styles.months}
            accessibilityLabel={t("admin.platform.retention.monthsLabel", {
              min: MIN_RETENTION_MONTHS,
              max: MAX_RETENTION_MONTHS,
            })}
          />
          <ThemedText style={[modalStyles.hint, { color: colors.muted }]}>
            {t("admin.platform.retention.warning")}
          </ThemedText>
        </View>
      ) : (
        <ThemedText style={[modalStyles.hint, { color: colors.muted }]}>
          {t("admin.platform.retention.noneHint")}
        </ThemedText>
      )}

      {error && (
        <ThemedText
          style={[modalStyles.error, { color: theme.colors.error }]}
          role="alert"
          testID="retention-error"
        >
          {error}
        </ThemedText>
      )}

      <View style={[modalStyles.actions, { borderTopColor: colors.border }]}>
        <Button variant="secondary" tone="neutral" size="md" onPress={onClose}>
          {t("common.actions.cancel")}
        </Button>
        <Button size="md" loading={busy} disabled={invalid} onPress={save}>
          {t("admin.platform.retention.save")}
        </Button>
      </View>
    </ModalCard>
  );
}

export default RetentionModal;
