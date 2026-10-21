import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const NARROW_WIDTH = 460;
export const WIDE_WIDTH = 880;

export const styles = StyleSheet.create({
  root: { flex: 1 },
  outer: {
    flexGrow: 1,
    alignItems: "center",
    padding: theme.spacing.xxl,
    paddingTop: 48,
    paddingBottom: 64,
  },
  centered: {
    justifyContent: "center",
  },
  container: {
    width: "100%",
    gap: theme.spacing.lg,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.spacing.sm,
  },
  brand: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    flexShrink: 1,
  },
  badge: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});
