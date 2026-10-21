import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  list: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  item: {
    flexGrow: 1,
    flexBasis: 120,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    borderWidth: 2,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.sm,
    minHeight: theme.a11y.minTouchTarget,
  },
  marker: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  markerText: {
    fontSize: 12,
    fontWeight: "700",
  },
  text: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
  },
  state: {
    fontSize: 11,
  },
});
