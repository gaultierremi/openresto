import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  list: { gap: theme.spacing.sm },
  row: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    gap: 2,
  },
  document: { fontSize: 14, fontWeight: "700", lineHeight: 20 },
  detail: { fontSize: 12, lineHeight: 17 },
});
