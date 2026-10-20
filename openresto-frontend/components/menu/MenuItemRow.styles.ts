import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  soldOut: {
    opacity: 0.5,
  },
  body: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  titleLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
  },
  badge: {
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  tags: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.xs,
  },
  tag: {
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 12,
    fontWeight: "600",
  },
  allergens: {
    fontSize: 12,
    lineHeight: 17,
  },
  side: {
    alignItems: "flex-end",
    gap: theme.spacing.sm,
  },
  price: {
    fontSize: 16,
    fontWeight: "700",
  },
});
