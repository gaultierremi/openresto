import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  item: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  line: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  summary: {
    flex: 1,
    minWidth: 160,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
  },
  dimmed: {
    opacity: 0.55,
  },
  meta: {
    fontSize: 13,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  error: {
    fontSize: 13,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
});
