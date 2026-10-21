import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.xxl,
  },
  centerTitle: {
    textAlign: "center",
  },
  centerText: {
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 420,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  headerText: {
    flex: 1,
    gap: theme.spacing.sm,
  },
  language: {
    minWidth: 132,
  },
  tablePill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  tablePillText: {
    fontSize: 14,
    fontWeight: "700",
  },
  menuTabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  menuTab: {
    minHeight: theme.a11y.minTouchTarget,
    justifyContent: "center",
    paddingHorizontal: theme.spacing.xl,
    borderWidth: 1,
    borderRadius: theme.borderRadius.full,
  },
  menuTabText: {
    fontSize: 15,
    fontWeight: "700",
  },
  menuDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  empty: {
    textAlign: "center",
    fontSize: 15,
    paddingVertical: theme.spacing.xxxl,
  },
  category: {
    gap: theme.spacing.xs,
  },
  categoryName: {
    marginTop: theme.spacing.sm,
  },
  categoryDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  bookBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    alignItems: "center",
  },
  bookInner: {
    width: "100%",
    maxWidth: 720,
  },
});
