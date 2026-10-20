import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import ConfirmModal from "@/components/common/ConfirmModal";
import { Icon } from "@/components/common/Icon";
import { Banner } from "@/components/onboarding/formParts";
import { publish, unpublish, type OnboardingState } from "@/api/onboarding";
import { useOnboardingCall } from "@/hooks/use-onboarding-call";
import { useAppTheme } from "@/hooks/use-app-theme";
import type { StepKey } from "@/constants/onboarding";
import { openExternal } from "@/utils/openExternal";
import { styles } from "./PublishPanel.styles";

/**
 * Taking the restaurant live, and back. Publishing is one press behind a confirmation, and it
 * is offered only when nothing stands in the way: otherwise the blockers are listed as links to
 * the step that settles each. Once live, the three public addresses are shown and unpublishing
 * is the secondary action. A suspended restaurant is the platform's to reopen, so it gets
 * neither. Every answer replaces the state, so the panel turns over without a reload.
 *
 * @see [PublishPanel.test.tsx](../../tests/components/onboarding/PublishPanel.test.tsx) — pins
 * Publish disabled with blockers and enabled without, that Cancel in the confirmation sends
 * nothing, the blockers jumping to their step, the live links, and a refusal keeping the panel.
 */
export function PublishPanel({
  restaurantId,
  state,
  onState,
  onGoToStep,
  onExpired,
}: {
  restaurantId: number;
  state: OnboardingState;
  onState: (state: OnboardingState) => void;
  onGoToStep: (step: StepKey) => void;
  onExpired: () => void;
}) {
  const { t } = useTranslation();
  const { colors, primaryColor } = useAppTheme();
  const [confirming, setConfirming] = useState<"publish" | "unpublish" | null>(null);
  const { busy, error, run } = useOnboardingCall(onExpired);

  const confirm = async () => {
    const call = confirming === "publish" ? publish : unpublish;
    const saved = await run(() => call(restaurantId));
    setConfirming(null);
    if (saved) onState(saved);
  };

  const origin = window.location.origin;
  const live = [
    { id: "site", label: t("admin.onboarding.publish.siteLink"), path: state.links.sitePath },
    {
      id: "booking",
      label: t("admin.onboarding.publish.bookingLink"),
      path: state.links.bookingPath,
    },
    { id: "menu", label: t("admin.onboarding.publish.menuLink"), path: state.links.menuPath },
  ].filter((link): link is { id: string; label: string; path: string } => link.path !== null);

  const stepLabel = (step: StepKey) => t(`admin.onboarding.steps.${step}`);

  let body;
  if (state.status === "Suspended") {
    body = <Banner tone="warning">{t("admin.onboarding.publish.suspended")}</Banner>;
  } else if (state.status === "Published") {
    body = (
      <>
        <View style={styles.liveHeader}>
          <Icon name="checkmark-circle" size="xl" color={colors.success} />
          <ThemedText type="h3" testID="publish-live">
            {t("admin.onboarding.publish.liveTitle")}
          </ThemedText>
        </View>
        <ThemedText style={[styles.lead, { color: colors.muted }]}>
          {t("admin.onboarding.publish.liveBody")}
        </ThemedText>
        <View style={styles.links}>
          {live.map((link) => (
            <View key={link.id} style={[styles.link, { borderColor: colors.border }]}>
              <View style={styles.linkText}>
                <ThemedText style={styles.linkLabel}>{link.label}</ThemedText>
                <ThemedText style={[styles.linkUrl, { color: colors.muted }]} selectable>
                  {`${origin}${link.path}`}
                </ThemedText>
              </View>
              <Button
                size="sm"
                variant="secondary"
                icon="open-outline"
                onPress={() => openExternal(`${origin}${link.path}`)}
                testID={`publish-open-${link.id}`}
              >
                {t("admin.onboarding.publish.open")}
              </Button>
            </View>
          ))}
        </View>
        <ButtonRow>
          <Button
            size="md"
            variant="secondary"
            tone="danger"
            onPress={() => setConfirming("unpublish")}
            testID="publish-unpublish"
          >
            {t("admin.onboarding.publish.unpublish")}
          </Button>
        </ButtonRow>
      </>
    );
  } else {
    body = (
      <>
        <ThemedText style={[styles.lead, { color: colors.muted }]}>
          {state.canPublish
            ? t("admin.onboarding.publish.readyBody")
            : t("admin.onboarding.publish.blockedBody")}
        </ThemedText>
        {!state.canPublish ? (
          <View style={styles.blockers} testID="publish-blockers">
            {state.publishBlockers.map((step) => (
              <Pressable
                key={step}
                onPress={() => onGoToStep(step)}
                accessibilityRole="link"
                style={styles.blocker}
                testID={`publish-blocker-${step}`}
              >
                <Icon name="alert-circle-outline" size="lg" color={colors.error} />
                <ThemedText style={[styles.blockerText, { color: primaryColor }]}>
                  {t("admin.onboarding.publish.blocker", { step: stepLabel(step) })}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        ) : null}
        <ButtonRow>
          <Button
            size="md"
            disabled={!state.canPublish}
            onPress={() => setConfirming("publish")}
            testID="publish-button"
          >
            {t("admin.onboarding.publish.publish")}
          </Button>
        </ButtonRow>
      </>
    );
  }

  return (
    <View
      style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.card }]}
      testID="publish-panel"
    >
      <ThemedText type="h2">{t("admin.onboarding.publish.title")}</ThemedText>
      {error ? <Banner testID="publish-error">{error.message}</Banner> : null}
      {body}

      <ConfirmModal
        visible={confirming !== null}
        destructive={confirming === "unpublish"}
        loading={busy}
        title={
          confirming === "unpublish"
            ? t("admin.onboarding.publish.unpublishTitle")
            : t("admin.onboarding.publish.publishTitle")
        }
        message={
          confirming === "unpublish"
            ? t("admin.onboarding.publish.unpublishMessage")
            : t("admin.onboarding.publish.publishMessage")
        }
        confirmLabel={
          confirming === "unpublish"
            ? t("admin.onboarding.publish.unpublishConfirm")
            : t("admin.onboarding.publish.publishConfirm")
        }
        onConfirm={confirm}
        onCancel={() => setConfirming(null)}
      />
    </View>
  );
}
