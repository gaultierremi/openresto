import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  group: {
    gap: theme.spacing.lg,
  },
  groupTitle: {
    ...theme.typography.bodyBold,
  },
  retention: {
    maxWidth: 140,
  },
});
