import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: theme.a11y.minTouchTarget,
  },
  heading: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    minHeight: theme.a11y.minTouchTarget,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderRadius: theme.borderRadius.full,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "500",
  },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: theme.a11y.minTouchTarget,
    marginTop: theme.spacing.xs,
  },
  toggleText: {
    flexShrink: 1,
  },
  clear: {
    minHeight: theme.a11y.minTouchTarget,
    justifyContent: "center",
  },
  clearText: {
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  disclaimer: {
    fontSize: 12,
    lineHeight: 17,
  },
});
