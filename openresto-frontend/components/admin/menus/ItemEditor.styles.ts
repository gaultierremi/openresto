import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  editor: {
    gap: theme.spacing.lg,
    padding: theme.spacing.lg,
    borderTopWidth: 1,
  },
  field: {
    gap: theme.spacing.xs,
    width: "100%",
    maxWidth: 640,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
  },
  error: {
    fontSize: 13,
  },
  multiline: {
    minHeight: 84,
    textAlignVertical: "top",
  },
  priceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  priceInput: {
    width: 140,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  photoRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: theme.spacing.lg,
  },
  photoActions: {
    flex: 1,
    minWidth: 220,
    gap: theme.spacing.sm,
  },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
});
