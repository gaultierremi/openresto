import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  importCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
  },
  importText: {
    flex: 1,
    gap: 2,
  },
  importTitle: {
    ...theme.typography.bodyBold,
  },
  importHint: {
    fontSize: 13,
    lineHeight: 18,
  },
  soon: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  categories: {
    gap: theme.spacing.lg,
  },
  category: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  categoryHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: theme.spacing.sm,
  },
  categoryName: {
    flexGrow: 1,
    flexBasis: 220,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
  },
  dishes: {
    gap: theme.spacing.md,
  },
  dish: {
    borderTopWidth: 1,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  dishTop: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
  },
  dishName: {
    flexGrow: 1,
    flexBasis: 200,
  },
  dishPrice: {
    width: 130,
  },
  note: {
    fontSize: 12,
    lineHeight: 17,
  },
});
