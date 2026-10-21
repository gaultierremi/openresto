import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import Select from "@/components/common/Select";
import TimePicker from "@/components/common/TimePicker";
import { ToggleSwitch } from "@/components/admin/settings/settingsShared";
import { Banner, Field } from "@/components/onboarding/formParts";
import { StepShell } from "@/components/onboarding/StepShell";
import { saveHours } from "@/api/onboarding";
import { useOnboardingCall } from "@/hooks/use-onboarding-call";
import { useAppTheme } from "@/hooks/use-app-theme";
import { ALLOWED_BOOKING_DURATIONS } from "@/constants/onboarding";
import {
  copyFirstOpenDay,
  hasOpenDay,
  normalizeDuration,
  patchRow,
  rowsFromHours,
  rowsToHours,
  type HourRow,
} from "@/utils/onboardingHours";
import type { StepProps } from "@/types/onboarding";
import { styles } from "./HoursStep.styles";

const WEEKDAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

/**
 * Step 2: the seven days, each open or closed with its times, and how long a table is kept. A
 * day with no entry is closed, so the week is only sendable with an open day and Continue says
 * so instead of letting the server refuse an empty week.
 *
 * @see [HoursStep.test.tsx](../../../tests/components/onboarding/steps/HoursStep.test.tsx) —
 * pins that only open days are sent, that Continue is disabled for an all-closed week and
 * enabled with one open day, that copying leaves closed days closed, and the server refusal.
 */
export function HoursStep({
  restaurantId,
  state,
  readOnly,
  onState,
  onAdvance,
  onBack,
  onExpired,
}: StepProps) {
  const { t } = useTranslation();
  const { colors, primaryColor } = useAppTheme();
  const [rows, setRows] = useState<HourRow[]>(() => rowsFromHours(state.hours.openHours));
  const [duration, setDuration] = useState(() =>
    normalizeDuration(state.hours.defaultBookingDurationMinutes)
  );
  const { busy, error, run } = useOnboardingCall(onExpired);

  const anyOpen = hasOpenDay(rows);

  const durationLabel = (minutes: number) => {
    if (minutes < 60) return t("admin.onboarding.hours.durationMinutes", { minutes });
    const hours = Math.floor(minutes / 60);
    return minutes % 60 === 0
      ? t("admin.onboarding.hours.durationHours", { hours })
      : t("admin.onboarding.hours.durationHoursMinutes", { hours, minutes: minutes % 60 });
  };

  const submit = async () => {
    const saved = await run(() =>
      saveHours(restaurantId, {
        openHours: rowsToHours(rows),
        defaultBookingDurationMinutes: duration,
      })
    );
    if (saved) {
      onState(saved);
      onAdvance();
    }
  };

  return (
    <StepShell
      testID="step-hours"
      title={t("admin.onboarding.hours.title")}
      description={t("admin.onboarding.hours.description")}
      readOnly={readOnly}
      busy={busy}
      primaryDisabled={!anyOpen}
      onPrimary={submit}
      onNext={onAdvance}
      onBack={onBack}
    >
      {error ? <Banner testID="step-hours-banner">{error.message}</Banner> : null}

      <ButtonRow align="start">
        <Button
          variant="secondary"
          size="sm"
          icon="copy-outline"
          disabled={!anyOpen}
          onPress={() => setRows(copyFirstOpenDay(rows))}
          testID="hours-copy"
        >
          {t("admin.onboarding.hours.copyToAll")}
        </Button>
      </ButtonRow>
      <ThemedText style={[styles.note, { color: colors.muted }]}>
        {t("admin.onboarding.hours.copyHint")}
      </ThemedText>

      <View style={styles.week}>
        {rows.map((row) => {
          const dayName = t(`admin.settings.weekdays.${WEEKDAY_KEYS[row.day - 1]}`);
          return (
            <View
              key={row.day}
              style={[styles.row, { borderColor: colors.border }]}
              testID={`hours-row-${row.day}`}
            >
              <ThemedText style={styles.day}>{dayName}</ThemedText>
              <ToggleSwitch
                checked={row.open}
                onChange={(open) => setRows(patchRow(rows, row.day, { open }))}
                primaryColor={primaryColor}
                borderColor={colors.border}
                accessibilityLabel={t("admin.onboarding.hours.openSwitch", { day: dayName })}
              />
              {row.open ? (
                <View style={styles.times}>
                  <View style={styles.time}>
                    <TimePicker
                      selectedTime={row.openTime}
                      onSelect={(openTime) => setRows(patchRow(rows, row.day, { openTime }))}
                      minTime="00:00"
                      maxTime="23:45"
                    />
                  </View>
                  <ThemedText style={{ color: colors.muted }}>–</ThemedText>
                  <View style={styles.time}>
                    <TimePicker
                      selectedTime={row.closeTime}
                      onSelect={(closeTime) => setRows(patchRow(rows, row.day, { closeTime }))}
                      minTime="00:00"
                      maxTime="23:45"
                    />
                  </View>
                </View>
              ) : (
                <ThemedText style={[styles.closed, { color: colors.muted }]}>
                  {t("admin.onboarding.hours.closed")}
                </ThemedText>
              )}
            </View>
          );
        })}
      </View>

      {!anyOpen ? (
        <ThemedText
          style={[styles.warning, { color: colors.error }]}
          role="status"
          testID="hours-none"
        >
          {t("errors.onboarding.hours_no_open_day")}
        </ThemedText>
      ) : null}

      <Field
        label={t("admin.onboarding.hours.durationLabel")}
        hint={t("admin.onboarding.hours.durationHint")}
        style={styles.duration}
        testID="hours-duration"
      >
        <Select
          options={ALLOWED_BOOKING_DURATIONS.map((minutes) => ({
            label: durationLabel(minutes),
            value: minutes,
          }))}
          selectedValue={duration}
          onSelect={(value) => setDuration(Number(value))}
          accessibilityLabel={t("admin.onboarding.hours.durationLabel")}
        />
      </Field>
    </StepShell>
  );
}
