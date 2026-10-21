import type { ReactNode } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import { useAppTheme } from "@/hooks/use-app-theme";
import { styles } from "./StepShell.styles";

/**
 * The frame of one step: its title and what it is for, the form, and the actions that close it.
 * Back and skip come first and the one filled button last. A read-only step (a suspended
 * restaurant) cannot save, so its filled button only moves on, under another name, and the form
 * above it takes no input.
 *
 * @see [StepShell.test.tsx](../../tests/components/onboarding/StepShell.test.tsx) — pins the
 * order of the buttons, that skip and back appear only when offered, and the read-only footer.
 */
export function StepShell({
  title,
  description,
  readOnly,
  busy,
  primaryLabel,
  primaryDisabled = false,
  onPrimary,
  onNext,
  onBack,
  onSkip,
  testID,
  children,
}: {
  title: string;
  description: string;
  readOnly: boolean;
  busy: boolean;
  /** The filled button's name; defaults to "Continuer". */
  primaryLabel?: string;
  primaryDisabled?: boolean;
  /** Saves, then moves on. Never called on a read-only step. */
  onPrimary: () => void;
  /** Moves on without saving, for a read-only step. */
  onNext: () => void;
  onBack?: () => void;
  onSkip?: () => void;
  testID: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  return (
    <View
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}
      testID={testID}
    >
      <View style={styles.header}>
        <ThemedText type="h2">{title}</ThemedText>
        <ThemedText style={[styles.description, { color: colors.muted }]}>{description}</ThemedText>
      </View>
      <View
        style={styles.body}
        pointerEvents={readOnly ? "none" : "auto"}
        aria-disabled={readOnly}
        testID={`${testID}-form`}
      >
        {children}
      </View>
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <ButtonRow>
          {onBack ? (
            <Button
              variant="ghost"
              tone="neutral"
              size="md"
              icon="arrow-back"
              disabled={busy}
              onPress={onBack}
              testID={`${testID}-back`}
            >
              {t("admin.onboarding.common.back")}
            </Button>
          ) : null}
          {onSkip && !readOnly ? (
            <Button
              variant="secondary"
              tone="neutral"
              size="md"
              disabled={busy}
              onPress={onSkip}
              testID={`${testID}-skip`}
            >
              {t("admin.onboarding.common.skip")}
            </Button>
          ) : null}
          {readOnly ? (
            <Button size="md" onPress={onNext} testID={`${testID}-next`}>
              {t("admin.onboarding.common.next")}
            </Button>
          ) : (
            <Button
              size="md"
              loading={busy}
              disabled={primaryDisabled}
              onPress={onPrimary}
              testID={`${testID}-continue`}
            >
              {primaryLabel ?? t("admin.onboarding.common.continue")}
            </Button>
          )}
        </ButtonRow>
      </View>
    </View>
  );
}
