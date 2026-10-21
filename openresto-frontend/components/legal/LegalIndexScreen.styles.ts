import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  header: { gap: theme.spacing.sm },
  meta: { fontSize: 13, lineHeight: 19 },
  list: { gap: theme.spacing.md },
  entry: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
});
