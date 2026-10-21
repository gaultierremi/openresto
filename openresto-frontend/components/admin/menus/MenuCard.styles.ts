import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.card,
    overflow: "hidden",
    ...theme.shadows.sm,
  },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
  },
  title: {
    flex: 1,
    minWidth: 200,
    gap: 2,
  },
  nameLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  badge: {
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  summary: {
    fontSize: 13,
  },
  headerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  error: {
    fontSize: 13,
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
  },
  body: {
    borderTopWidth: 1,
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  fields: {
    gap: theme.spacing.md,
  },
  field: {
    gap: theme.spacing.xs,
    width: "100%",
    maxWidth: 480,
  },
  currency: {
    gap: theme.spacing.xs,
    width: "100%",
    maxWidth: 240,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
  },
  categories: {
    gap: theme.spacing.md,
  },
});
