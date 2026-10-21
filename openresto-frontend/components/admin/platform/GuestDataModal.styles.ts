import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

/** The table is wider than a phone: the dialog scrolls it sideways rather than squeezing a column to nothing. */
export const styles = StyleSheet.create({
  table: { minWidth: 860 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  cell: { fontSize: 13, lineHeight: 18 },
  headerCell: { fontSize: 12, fontWeight: "700" },
  cellRef: { width: 96 },
  cellDate: { width: 150 },
  cellSeats: { width: 56 },
  cellName: { width: 140 },
  cellEmail: { width: 200 },
  cellRequests: { width: 180 },
  cellStatus: { width: 140 },
});
