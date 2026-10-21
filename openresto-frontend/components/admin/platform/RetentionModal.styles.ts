import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  options: { gap: theme.spacing.sm },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
  },
  optionText: { flex: 1, fontSize: 14, fontWeight: "500", lineHeight: 20 },
  months: { maxWidth: 160 },
});
