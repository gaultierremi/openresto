import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  list: {
    gap: theme.spacing.lg,
  },
  empty: {
    fontSize: 15,
    lineHeight: 22,
  },
  error: {
    fontSize: 13,
  },
});
