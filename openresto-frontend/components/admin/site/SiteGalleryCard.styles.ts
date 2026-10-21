import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  count: {
    fontSize: 13,
  },
  list: {
    gap: theme.spacing.md,
  },
  photo: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: theme.spacing.md,
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
  },
  fields: {
    flexGrow: 1,
    flexBasis: 240,
    gap: theme.spacing.xs,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  addForm: {
    gap: theme.spacing.sm,
    maxWidth: 480,
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
  },
  error: {
    fontSize: 13,
  },
});
