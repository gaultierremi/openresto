import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { useAppTheme } from "@/hooks/use-app-theme";
import { theme } from "@/theme/theme";
import { styles } from "./formParts.styles";

/**
 * A labelled field of the assistant's forms: the label above, then the control, then what the
 * field wants in one line, then the refusal that is about this field when there is one. The
 * refusal is announced as an alert because it appears after a press, away from the focus.
 */
export function Field({
  label,
  hint,
  error,
  testID,
  style,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.field, style]} testID={testID}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      {children}
      {hint ? <ThemedText style={[styles.hint, { color: colors.muted }]}>{hint}</ThemedText> : null}
      {error ? (
        <ThemedText
          style={[styles.error, { color: colors.error }]}
          role="alert"
          testID={testID ? `${testID}-error` : undefined}
        >
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** A refusal or a notice that concerns the whole form rather than one field. */
export function Banner({
  children,
  tone = "error",
  testID,
}: {
  children: ReactNode;
  tone?: "error" | "warning" | "info";
  testID?: string;
}) {
  const { colors } = useAppTheme();
  const color =
    tone === "error"
      ? colors.error
      : tone === "warning"
        ? theme.status.upcoming.text
        : colors.muted;
  return (
    <View
      accessible
      style={[styles.banner, { borderColor: color }]}
      role={tone === "error" ? "alert" : "status"}
      testID={testID}
    >
      <ThemedText style={[styles.bannerText, { color }]}>{children}</ThemedText>
    </View>
  );
}
