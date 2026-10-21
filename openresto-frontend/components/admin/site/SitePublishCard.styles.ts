import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  statusLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing.sm,
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
  address: {
    fontSize: 14,
  },
  checklist: {
    gap: theme.spacing.xs,
  },
  checkTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  checkItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
  },
  checkText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    fontSize: 13,
  },
});
