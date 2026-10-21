import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  stage: {
    gap: theme.spacing.xl,
  },
  intro: {
    gap: theme.spacing.xs,
  },
  introText: {
    fontSize: 14,
    lineHeight: 20,
  },
  panel: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    ...theme.shadows.sm,
  },
  panelText: {
    fontSize: 14,
    lineHeight: 20,
  },
  state: {
    gap: theme.spacing.md,
    alignItems: "flex-start",
  },
});
