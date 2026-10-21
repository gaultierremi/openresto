import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  rooms: {
    gap: theme.spacing.lg,
  },
  room: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  roomHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    gap: theme.spacing.md,
  },
  roomName: {
    flexGrow: 1,
    flexBasis: 220,
  },
  tables: {
    gap: theme.spacing.sm,
  },
  table: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing.md,
  },
  tableName: {
    flexGrow: 1,
    flexBasis: 180,
  },
  note: {
    fontSize: 12,
    lineHeight: 17,
  },
  warning: {
    fontSize: 13,
    fontWeight: "600",
  },
});
