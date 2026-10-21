import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.modal,
    padding: theme.spacing.xxl,
    gap: theme.spacing.md,
    alignItems: "flex-start",
    ...theme.shadows.lg,
  },
  title: {
    ...theme.typography.h2,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
  },
});
