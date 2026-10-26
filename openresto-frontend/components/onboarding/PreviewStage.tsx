import { useCallback, useEffect, useState, type ReactNode } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import { BookingPageMock } from "@/components/onboarding/BookingPageMock";
import { OnboardingSitePreview } from "@/components/onboarding/OnboardingSitePreview";
import { PublishPanel } from "@/components/onboarding/PublishPanel";
import { QrMenuPanel } from "@/components/onboarding/QrMenuPanel";
import { MenuPrintActions } from "@/components/onboarding/MenuPrintActions";
import { getPreview, type OnboardingPreview, type OnboardingState } from "@/api/onboarding";
import { useAppTheme } from "@/hooks/use-app-theme";
import type { Stage } from "@/constants/onboarding";
import { styles } from "./PreviewStage.styles";

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; preview: OnboardingPreview };

function Panel({
  title,
  text,
  testID,
  children,
}: {
  title: string;
  text: string;
  testID: string;
  children: ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.card }]}
      testID={testID}
    >
      <ThemedText type="h2">{title}</ThemedText>
      <ThemedText style={[styles.panelText, { color: colors.muted }]}>{text}</ThemedText>
      {children}
    </View>
  );
}

/**
 * The sixth stage: three panels of what guests will meet (the website, the QR menu, the booking
 * page) and the publication below them. Nothing is saved here. The panels read the preview the
 * server builds from what the five steps saved, loaded each time the stage opens so it is never
 * older than the last edit; if it cannot be loaded the panels give way to a retry, and the
 * publication does not, since it needs none of it.
 *
 * @see [PreviewStage.test.tsx](../../tests/components/onboarding/PreviewStage.test.tsx) — pins
 * the three panels, the booking mock's label, the retry after a failed load, a 401 reaching
 * the session, and the stage and publication working without the preview.
 */
export function PreviewStage({
  restaurantId,
  state,
  onState,
  onGoToStep,
  onBack,
  onExpired,
}: {
  restaurantId: number;
  state: OnboardingState;
  onState: (state: OnboardingState) => void;
  onGoToStep: (stage: Stage) => void;
  onBack: () => void;
  onExpired: () => void;
}) {
  const { t } = useTranslation();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setLoad({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getPreview(restaurantId).then((result) => {
      if (cancelled) return;
      if (result.ok) setLoad({ status: "ready", preview: result.value });
      else if (result.status === 401) onExpired();
      else setLoad({ status: "error", message: result.message });
    });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, attempt, onExpired]);

  return (
    <View style={styles.stage} testID="stage-preview">
      <View style={styles.intro}>
        <ThemedText type="h2">{t("admin.onboarding.preview.title")}</ThemedText>
        <ThemedText style={styles.introText}>
          {t("admin.onboarding.preview.description")}
        </ThemedText>
      </View>

      <Panel
        title={t("admin.onboarding.preview.site.title")}
        text={t("admin.onboarding.preview.site.text")}
        testID="preview-panel-site"
      >
        <OnboardingSitePreview restaurantId={restaurantId} version={state.status} />
      </Panel>

      {load.status === "ready" ? (
        <>
          <Panel
            title={t("admin.onboarding.preview.qr.title")}
            text={t("admin.onboarding.preview.qr.text")}
            testID="preview-panel-qr"
          >
            <QrMenuPanel
              name={state.name}
              menu={load.preview.menu}
              menuToken={state.links.menuToken}
              published={state.status === "Published"}
            />
            <MenuPrintActions
              restaurantId={restaurantId}
              name={state.name}
              menu={load.preview.menu}
              onExpired={onExpired}
            />
          </Panel>
          <Panel
            title={t("admin.onboarding.preview.booking.title")}
            text={t("admin.onboarding.preview.booking.text")}
            testID="preview-panel-booking"
          >
            <BookingPageMock preview={load.preview} />
          </Panel>
        </>
      ) : (
        <View style={styles.state} testID="preview-state">
          {load.status === "loading" ? (
            <ThemedText>{t("admin.onboarding.preview.loading")}</ThemedText>
          ) : (
            <>
              <ThemedText role="alert">{load.message}</ThemedText>
              <Button size="md" variant="secondary" onPress={retry} testID="preview-retry">
                {t("common.actions.tryAgain")}
              </Button>
            </>
          )}
        </View>
      )}

      <PublishPanel
        restaurantId={restaurantId}
        state={state}
        onState={onState}
        onGoToStep={onGoToStep}
        onExpired={onExpired}
      />

      <ButtonRow>
        <Button
          variant="ghost"
          tone="neutral"
          size="md"
          icon="arrow-back"
          onPress={onBack}
          testID="stage-preview-back"
        >
          {t("admin.onboarding.common.back")}
        </Button>
      </ButtonRow>
    </View>
  );
}
