import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  tile: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderRadius: theme.borderRadius.card,
    alignItems: "flex-start",
  },
  code: {
    width: 168,
    height: 168,
    borderRadius: theme.borderRadius.md,
    backgroundColor: "#ffffff",
  },
  text: {
    flex: 1,
    minWidth: 220,
    gap: theme.spacing.xs,
  },
  subtitle: {
    fontSize: 13,
  },
  url: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: theme.spacing.sm,
  },
  message: {
    fontSize: 13,
    fontWeight: "600",
  },
});
