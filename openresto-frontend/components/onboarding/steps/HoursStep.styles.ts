import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  week: {
    gap: theme.spacing.sm,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing.md,
    borderWidth: 1,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
  },
  day: {
    ...theme.typography.bodyBold,
    width: 96,
  },
  times: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    flexGrow: 1,
    flexBasis: 220,
  },
  time: {
    flex: 1,
    minWidth: 96,
  },
  closed: {
    fontSize: 14,
    flexGrow: 1,
  },
  note: {
    fontSize: 12,
  },
  warning: {
    fontSize: 13,
    fontWeight: "600",
  },
  duration: {
    maxWidth: 240,
  },
});
