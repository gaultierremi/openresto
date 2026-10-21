import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  header: {
    gap: theme.spacing.xs,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  body: {
    gap: theme.spacing.lg,
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: theme.spacing.lg,
  },
});
