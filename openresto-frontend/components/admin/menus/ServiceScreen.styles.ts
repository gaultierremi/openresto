import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

/** Rows are tall on purpose: this screen is pressed with a thumb, in a hurry, with a wet hand. */
export const ROW_MIN_HEIGHT = 64;

export const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    alignItems: "center",
  },
  column: {
    width: "100%",
    maxWidth: 720,
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  headerText: {
    flex: 1,
    minWidth: 220,
    gap: theme.spacing.xs,
  },
  back: {
    minHeight: theme.a11y.minTouchTarget,
    justifyContent: "center",
  },
  backText: {
    fontSize: 15,
    fontWeight: "700",
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  failure: {
    fontSize: 14,
    fontWeight: "600",
  },
  menu: {
    gap: theme.spacing.md,
  },
  menuName: {
    marginTop: theme.spacing.sm,
  },
  category: {
    gap: theme.spacing.sm,
  },
  categoryName: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    minHeight: ROW_MIN_HEIGHT,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderWidth: 2,
    borderRadius: theme.borderRadius.card,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontSize: 17,
    fontWeight: "700",
  },
  soldOutName: {
    textDecorationLine: "line-through",
    opacity: 0.7,
  },
  rowPrice: {
    fontSize: 14,
  },
  state: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.md,
    minHeight: 40,
  },
  stateText: {
    fontSize: 14,
    fontWeight: "800",
  },
});
