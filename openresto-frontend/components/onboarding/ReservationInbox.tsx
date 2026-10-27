import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import Button from "@/components/common/Button";
import { ThemedText } from "@/components/themed-text";
import { Banner } from "./formParts";
import { getInbox, type RestaurantInbox } from "@/api/onboarding";
import { useAppTheme } from "@/hooks/use-app-theme";
import { styles } from "./QuickStart.styles";

export const INBOX_POLL_MS = 15000;

export function ReservationInbox({
  restaurantId,
  onExpired,
}: {
  restaurantId: number;
  onExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { colors } = useAppTheme();
  const [inbox, setInbox] = useState<RestaurantInbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [newCount, setNewCount] = useState(0);
  const newest = useRef<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    let etag: string | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      const result = await getInbox(restaurantId, etag);
      if (cancelled) return;
      if (!result.ok) {
        etag = undefined;
        setInbox(null);
        if (result.status === 401) {
          setInbox(null);
          onExpired();
          return;
        }
        setError(result.message);
      } else if (result.value) {
        etag = result.value.etag;
        const ids = result.value.bookings.map((b) => b.id);
        if (newest.current !== null) {
          const previous = newest.current;
          setNewCount((count) => count + ids.filter((id) => id > previous).length);
        }
        newest.current = Math.max(newest.current ?? 0, ...ids);
        setInbox(result.value);
        setError(null);
      }
      timer = setTimeout(refresh, INBOX_POLL_MS);
    };
    void refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [restaurantId, onExpired, attempt]);
  return (
    <View style={styles.panel} testID="reservation-inbox">
      <ThemedText type="h2">{t("admin.onboarding.x3.inbox")}</ThemedText>
      <ThemedText>{t("admin.onboarding.x3.inboxHint")}</ThemedText>
      {newCount > 0 ? (
        <View role="status" testID="inbox-notification">
          <ThemedText style={styles.notice}>
            {t("admin.onboarding.x3.newBookings", { count: newCount })}
          </ThemedText>
          <Button size="md" variant="secondary" onPress={() => setNewCount(0)}>
            {t("admin.onboarding.x3.dismiss")}
          </Button>
        </View>
      ) : null}
      {error ? (
        <>
          <Banner>{error}</Banner>
          <Button size="md" variant="secondary" onPress={() => setAttempt((n) => n + 1)}>
            {t("common.actions.tryAgain")}
          </Button>
        </>
      ) : null}
      {inbox?.bookings.length === 0 ? (
        <ThemedText>{t("admin.onboarding.x3.empty")}</ThemedText>
      ) : null}
      {!inbox && !error ? <ThemedText>{t("admin.onboarding.wizard.loading")}</ThemedText> : null}
      {inbox?.bookings.map((booking) => (
        <View
          key={booking.id}
          style={[styles.row, { borderColor: colors.border }]}
          testID={`inbox-booking-${booking.id}`}
        >
          <ThemedText>
            {new Intl.DateTimeFormat(i18n.language, {
              timeZone: inbox.timezone,
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(booking.date))}{" "}
            · {booking.seats} {t("admin.onboarding.x3.seats")}
          </ThemedText>
          <ThemedText>
            {booking.customerName} · {booking.customerEmail}
          </ThemedText>
          <ThemedText>
            {booking.bookingRef}
            {booking.isCancelled ? ` · ${t("admin.onboarding.x3.cancelled")}` : ""}
          </ThemedText>
          {booking.specialRequests ? <ThemedText>{booking.specialRequests}</ThemedText> : null}
        </View>
      ))}
    </View>
  );
}
