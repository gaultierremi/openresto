import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.xl,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
  nameField: {
    flex: 1,
    minWidth: 180,
  },
  headerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  descriptionField: {
    paddingHorizontal: theme.spacing.md,
  },
  status: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  error: {
    fontSize: 13,
    paddingHorizontal: theme.spacing.md,
  },
  empty: {
    fontSize: 13,
    padding: theme.spacing.md,
  },
  add: {
    padding: theme.spacing.md,
  },
});
