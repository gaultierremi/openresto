import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const PHONE_WIDTH = 390;
export const PREVIEW_HEIGHT = 640;

export const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    ...theme.shadows.sm,
  },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  toggle: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
});
