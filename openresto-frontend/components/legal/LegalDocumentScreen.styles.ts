import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  header: { gap: theme.spacing.sm },
  meta: { fontSize: 13, lineHeight: 19 },
  section: { gap: theme.spacing.sm, paddingTop: theme.spacing.sm },
  others: {
    gap: theme.spacing.xs,
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    borderTopWidth: 1,
  },
});
