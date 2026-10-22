import { useCallback, useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import { OnboardingPage } from "./OnboardingPage";
import { OnboardingNotFound } from "./OnboardingNotFound";
import { Banner } from "./formParts";
import { ExceptionForm, WaitlistForm } from "./OperationsForms";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useOnboardingSession } from "@/context/OnboardingSessionContext";
import { useRouteDefaultLocale } from "@/context/LocaleContext";
import * as api from "@/api/operations";
import type { OnboardingResult } from "@/api/onboarding";
import type { WaitlistBoard } from "@/api/waitlist";
import { downloadCsv } from "@/utils/downloadCsv";
import { styles } from "./OperationsDashboard.styles";

function Card({ title, children }: { title: string; children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <ThemedText type="h2">{title}</ThemedText>
      {children}
    </View>
  );
}

export function OperationsDashboard({ restaurantId }: { restaurantId: number }) {
  const { t, i18n } = useTranslation();
  useRouteDefaultLocale("fr");
  const { colors, primaryColor } = useAppTheme();
  const { expire, signOut } = useOnboardingSession();
  const router = useRouter();
  const [data, setData] = useState<api.OperationsData | null>(null);
  const [board, setBoard] = useState<WaitlistBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [period, setPeriod] = useState<"today" | "week">("today");
  const [attempt, setAttempt] = useState(0);
  const [confirmLive, setConfirmLive] = useState(false);
  const [saved, setSaved] = useState(false);

  const fail = useCallback(
    (result: { status: number; message: string }) => {
      if (result.status === 401) expire();
      else if (result.status === 404) {
        setMissing(true);
        setData(null);
        setBoard(null);
      } else setError(result.message);
    },
    [expire]
  );

  useEffect(() => {
    let active = true;
    setData(null);
    setBoard(null);
    setMissing(false);
    setError(null);
    Promise.all([api.getOperations(restaurantId), api.getOperationsWaitlist(restaurantId)]).then(
      ([result, queue]) => {
        if (!active) return;
        if (result.ok && queue.ok) {
          setData(result.value);
          setBoard(queue.value);
        } else {
          if (!result.ok) fail(result);
          if (!queue.ok) fail(queue);
        }
      }
    );
    return () => {
      active = false;
    };
  }, [restaurantId, attempt, fail]);

  async function perform(call: () => Promise<OnboardingResult<undefined>>) {
    if (busy) return false;
    setBusy(true);
    setError(null);
    setSaved(false);
    const result = await call();
    setBusy(false);
    if (!result.ok) {
      fail(result);
      return false;
    }
    setSaved(true);
    setAttempt((n) => n + 1);
    return true;
  }

  if (missing) return <OnboardingNotFound />;
  if (!data || !board)
    return (
      <OnboardingPage centered>
        {error ? (
          <>
            <Banner>{error}</Banner>
            <Button size="md" onPress={() => setAttempt((n) => n + 1)}>
              {t("admin.operations.retry")}
            </Button>
          </>
        ) : (
          <ThemedText>{t("admin.operations.loading")}</ThemedText>
        )}
      </OnboardingPage>
    );

  const dayLabel = (date: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(`${date}T12:00:00Z`));
  const bookingTime = (date: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: data.timezone,
    }).format(new Date(date));
  const bookingDay = (date: string) =>
    new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: data.timezone,
    }).format(new Date(date));
  const chosenDays =
    period === "today" ? data.days.filter((d) => d.date === data.today) : data.days;
  const rows = data.bookings.filter((b) => period === "week" || bookingDay(b.date) === data.today);
  const today = data.days.find((d) => d.date === data.today);
  const disabled = busy || data.status === "Suspended";
  const statusLabel = (status: string) => t(`admin.operations.status.${status as "Booked"}`);
  const muted = { color: colors.muted };

  return (
    <OnboardingPage width="wide">
      <View style={styles.stack} testID="operations-dashboard">
        <View style={styles.header}>
          <ThemedText style={muted}>
            {data.name} · {dayLabel(data.today)}
          </ThemedText>
          <ThemedText type="h1">{t("admin.operations.title")}</ThemedText>
          <ThemedText style={[styles.intro, muted]}>{t("admin.operations.intro")}</ThemedText>
        </View>
        <ButtonRow align="start">
          <Button size="md" variant="ghost" tone="neutral" onPress={signOut}>
            {t("admin.operations.signOut")}
          </Button>
          <Button
            size="md"
            variant="secondary"
            onPress={() => router.push(`/onboarding/restaurant/${restaurantId}`)}
          >
            {t("admin.operations.setup")}
          </Button>
          <Button size="md" variant="secondary" onPress={() => setAttempt((n) => n + 1)}>
            {t("admin.operations.refresh")}
          </Button>
        </ButtonRow>
        {error && <Banner>{error}</Banner>}
        {saved && <Banner tone="info">{t("admin.operations.saved")}</Banner>}
        {data.status === "Suspended" && (
          <Banner tone="warning">{t("admin.onboarding.wizard.suspendedNoReason")}</Banner>
        )}
        <ButtonRow align="start">
          {(["today", "week"] as const).map((p) => (
            <Button
              key={p}
              size="md"
              variant={period === p ? "primary" : "secondary"}
              testID={`period-${p}`}
              onPress={() => setPeriod(p)}
            >
              {t(`admin.operations.${p}`)}
            </Button>
          ))}
        </ButtonRow>
        <View style={styles.cards}>
          {(
            [
              [t("admin.operations.bookings"), chosenDays.reduce((n, d) => n + d.bookings, 0)],
              [t("admin.operations.covers"), chosenDays.reduce((n, d) => n + d.covers, 0)],
              [t("admin.operations.noShows"), chosenDays.reduce((n, d) => n + d.noShows, 0)],
              [
                `${t("admin.operations.fill")} · ${t("admin.operations.today")}`,
                today?.fillRate === null || !today ? "—" : `${today.fillRate} %`,
              ],
            ] as const
          ).map(([label, value]) => (
            <View
              key={label}
              style={[styles.metric, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <ThemedText style={[styles.number, { color: primaryColor }]}>{value}</ThemedText>
              <ThemedText style={muted}>{label}</ThemedText>
            </View>
          ))}
        </View>
        <ThemedText style={[styles.note, muted]}>{t("admin.operations.fillHint")}</ThemedText>
        <Card title={t("admin.operations.week")}>
          <View style={styles.bars}>
            {data.days.map((day) => (
              <View key={day.date} style={[styles.day, { backgroundColor: colors.surfaceAlt }]}>
                <ThemedText>{dayLabel(day.date)}</ThemedText>
                <ThemedText>
                  {day.bookings} · {day.covers} {t("admin.operations.covers").toLowerCase()}
                </ThemedText>
                <View style={[styles.track, { backgroundColor: colors.border }]}>
                  <View
                    style={[
                      styles.bar,
                      { backgroundColor: primaryColor, width: `${day.fillRate ?? 0}%` },
                    ]}
                  />
                </View>
                <ThemedText style={muted}>
                  {day.fillRate === null ? "—" : `${day.fillRate} %`}
                </ThemedText>
              </View>
            ))}
          </View>
        </Card>
        <Card title={t("admin.operations.bookings")}>
          <ButtonRow align="start">
            <Button
              size="md"
              variant="secondary"
              testID="operations-export"
              disabled={busy}
              onPress={async () => {
                const result = await api.exportOperations(restaurantId);
                if (result.ok) downloadCsv(result.value);
                else fail(result);
              }}
            >
              {t("admin.operations.export")}
            </Button>
          </ButtonRow>
          {rows.length === 0 && (
            <ThemedText style={muted}>{t("admin.operations.empty")}</ThemedText>
          )}
          {rows.map((b) => (
            <View
              key={b.id}
              style={[styles.row, { borderColor: colors.border }]}
              testID={`booking-${b.id}`}
            >
              <View style={styles.rowText}>
                <ThemedText type="bodyBold">
                  {bookingTime(b.date)} · {b.name || t("admin.operations.guest")}
                </ThemedText>
                <ThemedText style={muted}>
                  {dayLabel(bookingDay(b.date))} ·{" "}
                  {t("admin.operations.people", { count: b.seats })} ·{" "}
                  {statusLabel(b.cancelled ? "Cancelled" : b.status)}
                </ThemedText>
                {b.reminder && (
                  <ThemedText style={muted}>
                    {t(`admin.operations.reminderState.${b.reminder as "simulated"}`)}
                  </ThemedText>
                )}
              </View>
              <ButtonRow align="start">
                {b.nextStatuses.map((status) => (
                  <Button
                    key={status}
                    size="md"
                    variant="secondary"
                    disabled={disabled}
                    onPress={() =>
                      perform(() => api.setOperationsStatus(restaurantId, b.id, status))
                    }
                  >
                    {statusLabel(status)}
                  </Button>
                ))}
              </ButtonRow>
            </View>
          ))}
        </Card>
        <Card title={t("admin.operations.waitlist")}>
          <ThemedText style={muted}>{t("admin.operations.waitlistHint")}</ThemedText>
          {board.entries.length === 0 && <ThemedText>{t("admin.operations.noWaiting")}</ThemedText>}
          {board.entries.map((entry) => (
            <View
              key={entry.id}
              style={[styles.row, { borderColor: colors.border }]}
              testID={`waiting-${entry.id}`}
            >
              <ThemedText>
                #{entry.number} · {entry.name} ·{" "}
                {t("admin.operations.people", { count: entry.seats })}
              </ThemedText>
              <ButtonRow align="start">
                <Button
                  size="md"
                  variant="ghost"
                  tone="danger"
                  disabled={disabled}
                  onPress={() =>
                    perform(() => api.actOnOperationsWaitlist(restaurantId, entry.id, "remove"))
                  }
                >
                  {t("admin.operations.remove")}
                </Button>
                <Button
                  size="md"
                  variant="secondary"
                  disabled={disabled || !entry.canSeatNow}
                  onPress={() =>
                    perform(() => api.actOnOperationsWaitlist(restaurantId, entry.id, "seat"))
                  }
                >
                  {t("admin.operations.seat")}
                </Button>
              </ButtonRow>
            </View>
          ))}
          <WaitlistForm
            disabled={disabled}
            onAdd={(name, seats, email) =>
              perform(() => api.addOperationsWaitlist(restaurantId, name, seats, email))
            }
          />
        </Card>
        <Card title={t("admin.operations.popular")}>
          <ThemedText style={muted}>{t("admin.operations.popularHint")}</ThemedText>
          {data.dishes.length === 0 && <ThemedText>{t("admin.operations.noViews")}</ThemedText>}
          {data.dishes.map((dish, i) => (
            <View key={`${i}-${dish.name}`} style={[styles.row, { borderColor: colors.border }]}>
              <ThemedText>
                {i + 1}. {dish.name}
              </ThemedText>
              <ThemedText type="bodyBold">{dish.views}</ThemedText>
            </View>
          ))}
        </Card>
        <Card title={t("admin.operations.exceptions")}>
          <ThemedText style={muted}>{t("admin.operations.exceptionsHint")}</ThemedText>
          {data.exceptions.length === 0 && (
            <ThemedText>{t("admin.operations.noExceptions")}</ThemedText>
          )}
          {data.exceptions.map((exception) => (
            <View key={exception.date} style={[styles.row, { borderColor: colors.border }]}>
              <ThemedText>
                {dayLabel(exception.date)} ·{" "}
                {exception.closed
                  ? t("admin.operations.closed")
                  : `${exception.open}–${exception.close}`}
              </ThemedText>
              <Button
                size="md"
                variant="ghost"
                tone="danger"
                disabled={disabled}
                onPress={() => perform(() => api.removeException(restaurantId, exception.date))}
              >
                {t("admin.operations.remove")}
              </Button>
            </View>
          ))}
          <ExceptionForm
            today={data.today}
            disabled={disabled}
            onAdd={(input) => perform(() => api.saveException(restaurantId, input))}
          />
        </Card>
        <Card title={t("admin.operations.reminders")}>
          <ThemedText type="bodyBold">
            {t(
              data.simulateEmailReminders ? "admin.operations.simulated" : "admin.operations.live"
            )}
          </ThemedText>
          <ThemedText style={muted}>{t("admin.operations.reminderHint")}</ThemedText>
          {confirmLive ? (
            <>
              <Banner tone="warning">{t("admin.operations.liveConfirm")}</Banner>
              <ButtonRow align="start">
                <Button size="md" variant="ghost" onPress={() => setConfirmLive(false)}>
                  {t("admin.operations.cancel")}
                </Button>
                <Button
                  size="md"
                  disabled={disabled}
                  onPress={async () => {
                    if (await perform(() => api.setReminderMode(restaurantId, false)))
                      setConfirmLive(false);
                  }}
                >
                  {t("admin.operations.confirmLive")}
                </Button>
              </ButtonRow>
            </>
          ) : (
            <ButtonRow align="start">
              <Button
                size="md"
                variant="secondary"
                disabled={disabled}
                onPress={() => {
                  if (data.simulateEmailReminders) setConfirmLive(true);
                  else void perform(() => api.setReminderMode(restaurantId, true));
                }}
              >
                {t(
                  data.simulateEmailReminders
                    ? "admin.operations.enableLive"
                    : "admin.operations.enableSimulation"
                )}
              </Button>
            </ButtonRow>
          )}
        </Card>
      </View>
    </OnboardingPage>
  );
}
