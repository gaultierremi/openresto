import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import { Banner } from "@/components/onboarding/formParts";
import { MessageCard } from "@/components/onboarding/MessageCard";
import { OnboardingNotFound } from "@/components/onboarding/OnboardingNotFound";
import { OnboardingPage } from "@/components/onboarding/OnboardingPage";
import { PreviewStage } from "@/components/onboarding/PreviewStage";
import { WizardHeader } from "@/components/onboarding/WizardHeader";
import { WizardStepper } from "@/components/onboarding/WizardStepper";
import { ReservationInbox } from "@/components/onboarding/ReservationInbox";
import { BrandingStep } from "@/components/onboarding/steps/BrandingStep";
import { HoursStep } from "@/components/onboarding/steps/HoursStep";
import { InfoStep } from "@/components/onboarding/steps/InfoStep";
import { LayoutStep } from "@/components/onboarding/steps/LayoutStep";
import { MenuStep } from "@/components/onboarding/steps/MenuStep";
import { getState, type OnboardingState } from "@/api/onboarding";
import { useOnboardingSession } from "@/context/OnboardingSessionContext";
import { PREVIEW_STAGE, type Stage } from "@/constants/onboarding";
import { initialStage, neighbour, parseStage } from "@/utils/onboardingStages";
import type { StepProps } from "@/types/onboarding";
import { styles } from "./OnboardingWizard.styles";

type Load =
  | { status: "loading" }
  | { status: "notFound" }
  | { status: "error"; message: string }
  | { status: "ready"; state: OnboardingState };

/**
 * The five-step assistant for one restaurant, and its preview. It opens where the restaurateur
 * left off (the address's `?step=`, else the first step still to do, else the preview) and lets
 * them open any stage at any time. Every write answers with the whole state, which replaces the
 * one held here, so the stepper and the publish panel are never a reload behind. A suspended
 * restaurant is shown its reason and every form turns read-only; a restaurant that is not theirs
 * is shown nothing about it, exactly as one that does not exist.
 *
 * @see [OnboardingWizard.test.tsx](../../tests/components/onboarding/OnboardingWizard.test.tsx)
 * — pins the opening stage in each of its three cases, jumping to any stage, a save advancing
 * only on success, the not-found screen holding no data, the suspended banner and read-only
 * forms, and a 401 ending the session.
 */
export function OnboardingWizard({ restaurantId }: { restaurantId: number }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { step } = useLocalSearchParams<{ step?: string }>();
  const session = useOnboardingSession();
  const { expire, signOut } = session;
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [stage, setStage] = useState<Stage>("info");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getState(restaurantId).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setLoad({ status: "ready", state: result.value });
        setStage(initialStage(result.value, step));
      } else if (result.status === 401) {
        expire();
      } else if (result.status === 404) {
        setLoad({ status: "notFound" });
      } else {
        setLoad({ status: "error", message: result.message });
      }
    });
    return () => {
      cancelled = true;
    };
    // `step` only matters for the first answer; later changes are the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, attempt, expire]);

  // An address that changes `?step=` while the assistant is open moves it there.
  useEffect(() => {
    const requested = parseStage(step);
    if (requested) setStage(requested);
  }, [step]);

  const goTo = useCallback(
    (next: Stage) => {
      setStage(next);
      router.setParams({ step: next });
    },
    [router]
  );

  const replaceState = useCallback(
    (state: OnboardingState) => setLoad({ status: "ready", state }),
    []
  );

  if (load.status === "notFound") return <OnboardingNotFound />;

  if (load.status === "error") {
    return (
      <OnboardingPage centered>
        <MessageCard
          icon="cloud-offline-outline"
          title={t("admin.onboarding.wizard.errorTitle")}
          body={load.message}
          testID="wizard-error"
        >
          <Button
            size="md"
            variant="secondary"
            onPress={() => {
              setLoad({ status: "loading" });
              setAttempt((n) => n + 1);
            }}
            testID="wizard-retry"
          >
            {t("common.actions.tryAgain")}
          </Button>
        </MessageCard>
      </OnboardingPage>
    );
  }

  if (load.status === "loading") {
    return (
      <OnboardingPage centered>
        <ThemedText testID="wizard-loading">{t("admin.onboarding.wizard.loading")}</ThemedText>
      </OnboardingPage>
    );
  }

  const { state } = load;
  const previous = neighbour(stage, -1);
  const next = neighbour(stage, 1);
  const common: StepProps = {
    restaurantId,
    state,
    readOnly: state.status === "Suspended",
    onState: replaceState,
    onAdvance: () => next && goTo(next),
    onBack: previous ? () => goTo(previous) : undefined,
    onExpired: expire,
  };

  return (
    <OnboardingPage width="wide">
      <View style={styles.wizard}>
        <WizardHeader name={state.name} status={state.status} onSignOut={signOut} />
        {state.status === "Published" ? (
          <ReservationInbox key={restaurantId} restaurantId={restaurantId} onExpired={expire} />
        ) : null}
        {state.status === "Suspended" ? (
          <Banner tone="warning" testID="wizard-suspended">
            {state.suspensionReason
              ? t("admin.onboarding.wizard.suspended", { reason: state.suspensionReason })
              : t("admin.onboarding.wizard.suspendedNoReason")}
          </Banner>
        ) : null}
        <WizardStepper state={state} stage={stage} onSelect={goTo} />
        {stage === "info" ? <InfoStep key="info" {...common} /> : null}
        {stage === "hours" ? <HoursStep key="hours" {...common} /> : null}
        {stage === "layout" ? <LayoutStep key="layout" {...common} /> : null}
        {stage === "menu" ? <MenuStep key="menu" {...common} /> : null}
        {stage === "branding" ? <BrandingStep key="branding" {...common} /> : null}
        {stage === PREVIEW_STAGE ? (
          <PreviewStage
            key="preview"
            restaurantId={restaurantId}
            state={state}
            onState={replaceState}
            onGoToStep={goTo}
            onBack={() => previous && goTo(previous)}
            onExpired={expire}
          />
        ) : null}
      </View>
    </OnboardingPage>
  );
}
