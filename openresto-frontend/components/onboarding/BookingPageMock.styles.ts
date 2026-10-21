import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  frame: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  badge: {
    alignSelf: "flex-start",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  name: {
    ...theme.typography.h2,
  },
  line: {
    fontSize: 14,
    lineHeight: 20,
  },
  block: {
    gap: theme.spacing.sm,
  },
  blockTitle: {
    ...theme.typography.bodyBold,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  chip: {
    minWidth: 44,
    alignItems: "center",
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "600",
  },
  hoursRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    maxWidth: 320,
  },
  facts: {
    fontSize: 13,
  },
});
