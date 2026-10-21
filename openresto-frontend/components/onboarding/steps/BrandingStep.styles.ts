import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const SWATCH_SIZE = 36;

export const styles = StyleSheet.create({
  logo: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  swatches: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  swatch: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: SWATCH_SIZE / 2,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  hex: {
    maxWidth: 160,
  },
  note: {
    fontSize: 12,
    lineHeight: 17,
  },
  problem: {
    fontSize: 13,
    fontWeight: "600",
  },
});
