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
  fields: {
    gap: theme.spacing.md,
  },
  field: {
    gap: theme.spacing.xs,
  },
  label: {
    ...theme.typography.label,
  },
  error: {
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    backgroundColor: "rgba(220,38,38,0.08)",
  },
  errorText: {
    color: theme.colors.error,
    fontSize: 14,
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
  },
});
