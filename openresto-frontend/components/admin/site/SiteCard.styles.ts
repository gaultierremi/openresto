import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadows.sm,
  },
  header: {
    gap: 2,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  body: {
    gap: theme.spacing.md,
  },
});

/** The small pieces every field of the site cards is built from. */
export const fieldStyles = StyleSheet.create({
  field: {
    gap: theme.spacing.xs,
    width: "100%",
    maxWidth: 480,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
  },
  error: {
    fontSize: 13,
  },
});
