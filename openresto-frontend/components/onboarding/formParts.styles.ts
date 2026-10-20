import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  field: {
    gap: theme.spacing.xs,
    width: "100%",
    maxWidth: 520,
  },
  label: {
    ...theme.typography.label,
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
  },
  error: {
    fontSize: 13,
    fontWeight: "600",
  },
  banner: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
  },
  bannerText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
