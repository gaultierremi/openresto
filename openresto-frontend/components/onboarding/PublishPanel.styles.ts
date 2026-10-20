import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    ...theme.shadows.sm,
  },
  lead: {
    fontSize: 14,
    lineHeight: 20,
  },
  blockers: {
    gap: theme.spacing.sm,
  },
  blocker: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  liveHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  blockerText: {
    fontWeight: "600",
  },
  links: {
    gap: theme.spacing.md,
  },
  link: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
    borderWidth: 1,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
  },
  linkText: {
    flex: 1,
    minWidth: 200,
    gap: 2,
  },
  linkLabel: {
    ...theme.typography.bodyBold,
  },
  linkUrl: {
    fontSize: 12,
  },
});
