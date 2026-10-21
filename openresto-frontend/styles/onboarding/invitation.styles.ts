import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.modal,
    padding: theme.spacing.xxl,
    gap: theme.spacing.lg,
    ...theme.shadows.lg,
  },
  title: {
    ...theme.typography.h1,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  readOnly: {
    borderWidth: 1,
    borderRadius: theme.formSizes.inputBorderRadius,
    paddingHorizontal: theme.formSizes.inputPaddingH,
    paddingVertical: theme.spacing.md,
  },
  readOnlyText: {
    fontSize: theme.formSizes.inputFontSize,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  passwordInput: {
    flex: 1,
  },
  rule: {
    fontSize: 12,
    lineHeight: 17,
  },
  consents: {
    gap: theme.spacing.md,
  },
  consentsTitle: {
    ...theme.typography.bodyBold,
  },
  note: {
    fontSize: 13,
    lineHeight: 19,
  },
});
