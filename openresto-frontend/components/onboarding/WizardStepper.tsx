import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/common/Icon";
import { useAppTheme } from "@/hooks/use-app-theme";
import { PREVIEW_STAGE, STAGES, type Stage, type StepState } from "@/constants/onboarding";
import { stepState } from "@/utils/onboardingStages";
import type { OnboardingState } from "@/api/onboarding";
import { styles } from "./WizardStepper.styles";

/**
 * The six stages in order, each showing where it stands (to do, done, skipped; the preview has
 * none) and each a press away: resuming at any time means any stage can be opened at any time,
 * whatever the others say.
 *
 * @see [WizardStepper.test.tsx](../../tests/components/onboarding/WizardStepper.test.tsx) —
 * pins the order, the state of each step, the selected stage, and that every stage, a later one
 * included, can be opened.
 */
export function WizardStepper({
  state,
  stage,
  onSelect,
}: {
  state: OnboardingState;
  stage: Stage;
  onSelect: (stage: Stage) => void;
}) {
  const { t } = useTranslation();
  const { colors, primaryColor } = useAppTheme();

  const stateLabel: Record<StepState, string> = {
    Todo: t("admin.onboarding.stepper.todo"),
    Done: t("admin.onboarding.stepper.done"),
    Skipped: t("admin.onboarding.stepper.skipped"),
  };

  return (
    <View
      style={styles.list}
      accessibilityLabel={t("admin.onboarding.stepper.label")}
      role="tablist"
    >
      {STAGES.map((key, index) => {
        const selected = key === stage;
        const current = key === PREVIEW_STAGE ? null : stepState(state, key);
        const label = t(`admin.onboarding.steps.${key}`);
        return (
          <Pressable
            key={key}
            onPress={() => onSelect(key)}
            role="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={current ? `${label}, ${stateLabel[current]}` : label}
            style={[
              styles.item,
              {
                borderColor: selected ? primaryColor : colors.border,
                backgroundColor: colors.card,
              },
            ]}
            testID={`stepper-${key}`}
          >
            <View
              style={[
                styles.marker,
                { backgroundColor: current === "Done" ? colors.success : colors.input },
              ]}
            >
              {current === "Done" ? (
                <Icon name="checkmark" size="md" color="#fff" />
              ) : (
                <ThemedText style={[styles.markerText, { color: colors.muted }]}>
                  {index + 1}
                </ThemedText>
              )}
            </View>
            <View style={styles.text}>
              <ThemedText style={styles.label} numberOfLines={2}>
                {label}
              </ThemedText>
              {current ? (
                <ThemedText style={[styles.state, { color: colors.muted }]}>
                  {stateLabel[current]}
                </ThemedText>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
