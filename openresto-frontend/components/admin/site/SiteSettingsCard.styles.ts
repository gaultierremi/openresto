import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  stack: {
    gap: theme.spacing.lg,
  },
  brandLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
  },
  brandText: {
    fontSize: 13,
    lineHeight: 18,
  },
  addressLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  prefix: {
    fontSize: 15,
  },
  addressInput: {
    flex: 1,
  },
});
