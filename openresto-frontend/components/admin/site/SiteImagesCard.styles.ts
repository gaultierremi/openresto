import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  slot: {
    gap: theme.spacing.xs,
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
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  error: {
    fontSize: 13,
  },
});
