import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import { MenuPhoto } from "@/components/menu/MenuPhoto";
import { useAppTheme } from "@/hooks/use-app-theme";
import { labelOn } from "@/utils/contrast";
import type { OnboardingPreview } from "@/api/onboarding";
import { styles } from "./BookingPageMock.styles";

const WEEKDAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

/** A party picker of eight is what the real page opens with; more would be a wall of chips. */
const MAX_PARTY_CHIPS = 8;
const LOGO_SIZE = 56;

/**
 * A static stand-in for the booking page, built from the figures the server returns: what a
 * guest would read (name, address, phone, hours) and the controls they would use (party size
 * and the first sittings). Nothing in it is pressable and it says so, because the real page
 * only exists once the restaurant is published.
 *
 * @see [BookingPageMock.test.tsx](../../tests/components/onboarding/BookingPageMock.test.tsx) —
 * pins the label that this is a preview, the hours and closed days, the party sizes up to the
 * largest table, and the sample slots.
 */
export function BookingPageMock({ preview }: { preview: OnboardingPreview }) {
  const { t } = useTranslation();
  const { colors, primaryColor } = useAppTheme();
  const accent = preview.primaryColor ?? primaryColor;
  const parties = Array.from(
    { length: Math.min(preview.largestParty, MAX_PARTY_CHIPS) },
    (_, i) => i + 1
  );

  return (
    <View style={[styles.frame, { borderColor: colors.border }]} testID="booking-page-mock">
      <ThemedText
        style={[styles.badge, { color: colors.muted, backgroundColor: colors.input }]}
        testID="booking-mock-label"
      >
        {t("admin.onboarding.preview.booking.label")}
      </ThemedText>

      <View style={styles.header}>
        {preview.logoUrl ? <MenuPhoto uri={preview.logoUrl} size={LOGO_SIZE} /> : null}
        <View style={styles.headerText}>
          <ThemedText style={[styles.name, { color: accent }]}>{preview.restaurantName}</ThemedText>
          {preview.tagline ? (
            <ThemedText style={[styles.line, { color: colors.muted }]}>
              {preview.tagline}
            </ThemedText>
          ) : null}
          {preview.address ? <ThemedText style={styles.line}>{preview.address}</ThemedText> : null}
          {preview.phoneNumber ? (
            <ThemedText style={styles.line}>{preview.phoneNumber}</ThemedText>
          ) : null}
        </View>
      </View>

      <View style={styles.block}>
        <ThemedText style={styles.blockTitle}>
          {t("admin.onboarding.preview.booking.hours")}
        </ThemedText>
        {WEEKDAY_KEYS.map((key, index) => {
          const hours = preview.openHours.find((h) => h.day === index + 1);
          return (
            <View key={key} style={styles.hoursRow} testID={`booking-mock-hours-${index + 1}`}>
              <ThemedText style={styles.line}>{t(`admin.settings.weekdays.${key}`)}</ThemedText>
              <ThemedText style={[styles.line, !hours && { color: colors.muted }]}>
                {hours ? `${hours.open} – ${hours.close}` : t("admin.onboarding.hours.closed")}
              </ThemedText>
            </View>
          );
        })}
      </View>

      <View style={styles.block}>
        <ThemedText style={styles.blockTitle}>
          {t("admin.onboarding.preview.booking.party")}
        </ThemedText>
        <View style={styles.chips}>
          {parties.map((size) => (
            <View
              key={size}
              style={[
                styles.chip,
                {
                  borderColor: size === 2 ? accent : colors.border,
                  backgroundColor: size === 2 ? accent : "transparent",
                },
              ]}
            >
              <ThemedText style={[styles.chipText, size === 2 && { color: labelOn(accent) }]}>
                {size}
              </ThemedText>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.block}>
        <ThemedText style={styles.blockTitle}>
          {t("admin.onboarding.preview.booking.slots")}
        </ThemedText>
        {preview.sampleSlots.length === 0 ? (
          <ThemedText style={[styles.line, { color: colors.muted }]} testID="booking-mock-no-slots">
            {t("admin.onboarding.preview.booking.noSlots")}
          </ThemedText>
        ) : (
          <View style={styles.chips}>
            {preview.sampleSlots.map((slot) => (
              <View key={slot} style={[styles.chip, { borderColor: accent }]}>
                <ThemedText style={[styles.chipText, { color: accent }]}>{slot}</ThemedText>
              </View>
            ))}
          </View>
        )}
      </View>

      <ThemedText style={[styles.facts, { color: colors.muted }]}>
        {t("admin.onboarding.preview.booking.facts", {
          tables: preview.tableCount,
          minutes: preview.bookingDurationMinutes,
          interval: preview.slotIntervalMinutes,
        })}
      </ThemedText>
    </View>
  );
}
