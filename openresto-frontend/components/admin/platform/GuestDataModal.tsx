import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import { Icon } from "@/components/common/Icon";
import { ModalCard } from "@/components/common/ModalCard";
import { useAppTheme } from "@/hooks/use-app-theme";
import { theme } from "@/theme/theme";
import { fmtDateTime } from "@/utils/formatters";
import {
  accessPlatformGuestData,
  type GuestDataAccess,
  type PlatformGuestBooking,
  type PlatformRestaurant,
} from "@/api/platform";
import { MAX_ACCESS_REASON_LENGTH, MIN_ACCESS_REASON_LENGTH } from "@/constants/platform";
import { styles as modalStyles } from "./modal.styles";
import { styles } from "./GuestDataModal.styles";

const EMPTY_CELL = "—";

/**
 * The one door to a restaurant's guests. It opens on a plain statement of what the access is
 * (not a default, recorded with the reason and the operator's name, the reason describes the
 * ticket and never names a guest) and asks for that reason before anything is fetched: the
 * submit stays off below the minimum and the handler refuses too, so no call leaves without one.
 *
 * What comes back lives in this component's state and nowhere else: not in storage, not in the
 * list behind the dialog. Closing it, by the button, the backdrop or Escape, empties the state
 * before the dialog goes. If the server refuses the reason, its message is shown and no data is.
 *
 * @see [GuestDataModal.test.tsx](../../../tests/components/admin/platform/GuestDataModal.test.tsx)
 * — pins the warning, the 9-versus-10 character boundary, the refusal that fetches nothing, the
 * logged-access banner, the anonymised rows, and that closing drops the data.
 */
export function GuestDataModal({
  restaurant,
  onClose,
}: {
  restaurant: PlatformRestaurant;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GuestDataAccess | null>(null);

  const reasonLength = reason.trim().length;
  const reasonReady = reasonLength >= MIN_ACCESS_REASON_LENGTH;

  const submit = async () => {
    if (busy || !reasonReady) return;
    setError(null);
    setBusy(true);
    const result = await accessPlatformGuestData(restaurant.id, reason.trim());
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setData(result.value);
  };

  const close = () => {
    setData(null);
    setReason("");
    setError(null);
    onClose();
  };

  return (
    <ModalCard
      visible
      wide={data !== null}
      alert={data === null}
      title={t("admin.platform.guestData.title", { name: restaurant.name })}
      onDismiss={close}
      dismissLabel={t("common.actions.close")}
      testID="guest-data-modal"
    >
      {data === null ? (
        <>
          <View
            role="note"
            testID="guest-data-warning"
            style={[
              modalStyles.notice,
              { borderColor: theme.colors.warning, backgroundColor: `${theme.colors.warning}14` },
            ]}
          >
            <Icon
              name="shield-checkmark-outline"
              size="sm"
              color={theme.colors.warning}
              style={modalStyles.noticeIcon}
            />
            <View style={modalStyles.noticeBody}>
              <ThemedText style={modalStyles.noticeTitle}>
                {t("admin.platform.guestData.warningTitle")}
              </ThemedText>
              <ThemedText style={modalStyles.noticeText}>
                {t("admin.platform.guestData.warningDefault")}
              </ThemedText>
              <ThemedText style={modalStyles.noticeText}>
                {t("admin.platform.guestData.warningAudit")}
              </ThemedText>
              <ThemedText style={modalStyles.noticeText}>
                {t("admin.platform.guestData.warningReason")}
              </ThemedText>
            </View>
          </View>

          <View style={modalStyles.field}>
            <ThemedText style={modalStyles.label}>
              {t("admin.platform.guestData.reasonLabel")}
            </ThemedText>
            <Input
              value={reason}
              onChangeText={setReason}
              maxLength={MAX_ACCESS_REASON_LENGTH}
              multiline
              style={modalStyles.multiline}
              accessibilityLabel={t("admin.platform.guestData.reasonLabel")}
            />
            <ThemedText
              style={[
                modalStyles.counter,
                { color: reasonReady ? colors.muted : theme.colors.error },
              ]}
              testID="guest-data-counter"
            >
              {t("admin.platform.guestData.counter", {
                count: reasonLength,
                min: MIN_ACCESS_REASON_LENGTH,
                max: MAX_ACCESS_REASON_LENGTH,
              })}
            </ThemedText>
          </View>

          {error && (
            <ThemedText
              style={[modalStyles.error, { color: theme.colors.error }]}
              role="alert"
              testID="guest-data-error"
            >
              {error}
            </ThemedText>
          )}

          <View style={[modalStyles.actions, { borderTopColor: colors.border }]}>
            <Button variant="secondary" tone="neutral" size="md" onPress={close}>
              {t("common.actions.cancel")}
            </Button>
            <Button size="md" disabled={!reasonReady} loading={busy} onPress={submit}>
              {t("admin.platform.guestData.submit")}
            </Button>
          </View>
        </>
      ) : (
        <>
          <View
            role="alert"
            testID="guest-data-banner"
            style={[
              modalStyles.notice,
              { borderColor: theme.colors.warning, backgroundColor: `${theme.colors.warning}14` },
            ]}
          >
            <Icon
              name="shield-checkmark-outline"
              size="sm"
              color={theme.colors.warning}
              style={modalStyles.noticeIcon}
            />
            <View style={modalStyles.noticeBody}>
              <ThemedText style={modalStyles.noticeTitle}>
                {t("admin.platform.guestData.banner")}
              </ThemedText>
              <ThemedText style={modalStyles.noticeText}>
                {t("admin.platform.guestData.bannerDetail", {
                  date: fmtDateTime(new Date(data.grantedAt)),
                })}
              </ThemedText>
            </View>
          </View>

          {data.totalBookings > data.bookings.length && (
            <ThemedText style={{ color: colors.muted }} testID="guest-data-truncated">
              {t("admin.platform.guestData.truncated", {
                shown: data.bookings.length,
                total: data.totalBookings,
              })}
            </ThemedText>
          )}

          {data.bookings.length === 0 ? (
            <ThemedText style={{ color: colors.muted }} testID="guest-data-empty">
              {t("admin.platform.guestData.empty")}
            </ThemedText>
          ) : (
            <ScrollView horizontal testID="guest-data-scroll">
              <View role="table" style={styles.table}>
                <GuestDataHeader />
                {data.bookings.map((booking) => (
                  <GuestDataRow key={booking.bookingRef} booking={booking} />
                ))}
              </View>
            </ScrollView>
          )}

          <View style={[modalStyles.actions, { borderTopColor: colors.border }]}>
            <Button size="md" onPress={close}>
              {t("admin.platform.guestData.close")}
            </Button>
          </View>
        </>
      )}
    </ModalCard>
  );
}

function GuestDataHeader() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const columns = [
    [styles.cellRef, t("admin.platform.guestData.columns.ref")],
    [styles.cellDate, t("admin.platform.guestData.columns.date")],
    [styles.cellSeats, t("admin.platform.guestData.columns.seats")],
    [styles.cellName, t("admin.platform.guestData.columns.name")],
    [styles.cellEmail, t("admin.platform.guestData.columns.email")],
    [styles.cellRequests, t("admin.platform.guestData.columns.requests")],
    [styles.cellStatus, t("admin.platform.guestData.columns.status")],
  ] as const;

  return (
    <View role="row" style={[styles.row, { borderBottomColor: colors.border }]}>
      {columns.map(([width, label]) => (
        <ThemedText
          key={label}
          role="columnheader"
          style={[styles.cell, styles.headerCell, width, { color: colors.muted }]}
        >
          {label}
        </ThemedText>
      ))}
    </View>
  );
}

function GuestDataRow({ booking }: { booking: PlatformGuestBooking }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const flags = [
    booking.isCancelled ? t("admin.platform.guestData.cancelled") : null,
    booking.isAnonymized ? t("admin.platform.guestData.anonymised") : null,
  ].filter(Boolean);

  return (
    <View
      role="row"
      testID={`guest-data-row-${booking.bookingRef}`}
      style={[styles.row, { borderBottomColor: colors.border }]}
    >
      <ThemedText role="cell" style={[styles.cell, styles.cellRef]}>
        {booking.bookingRef}
      </ThemedText>
      <ThemedText role="cell" style={[styles.cell, styles.cellDate]}>
        {fmtDateTime(new Date(booking.date))}
      </ThemedText>
      <ThemedText role="cell" style={[styles.cell, styles.cellSeats]}>
        {booking.seats}
      </ThemedText>
      <ThemedText role="cell" style={[styles.cell, styles.cellName]}>
        {booking.isAnonymized
          ? t("admin.platform.guestData.anonymised")
          : (booking.customerName ?? EMPTY_CELL)}
      </ThemedText>
      <ThemedText role="cell" style={[styles.cell, styles.cellEmail]}>
        {booking.customerEmail ?? EMPTY_CELL}
      </ThemedText>
      <ThemedText role="cell" style={[styles.cell, styles.cellRequests]}>
        {booking.specialRequests ?? EMPTY_CELL}
      </ThemedText>
      <ThemedText role="cell" style={[styles.cell, styles.cellStatus]}>
        {flags.length > 0 ? flags.join(", ") : EMPTY_CELL}
      </ThemedText>
    </View>
  );
}

export default GuestDataModal;
