import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  root: {
    gap: theme.spacing.lg,
  },
  top: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.lg,
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
  url: {
    fontSize: 12,
    lineHeight: 17,
  },
  note: {
    fontSize: 13,
    lineHeight: 18,
  },
  menu: {
    gap: theme.spacing.md,
  },
  category: {
    gap: theme.spacing.xs,
  },
  categoryName: {
    ...theme.typography.h3,
  },
  dish: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: theme.spacing.md,
  },
  dishText: {
    flex: 1,
    gap: 2,
  },
  dishName: {
    ...theme.typography.bodyBold,
  },
  dishDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  price: {
    ...theme.typography.bodyBold,
  },
});
