import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  list: {
    gap: theme.spacing.sm,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  kind: {
    width: 170,
  },
  url: {
    flexGrow: 1,
    flexBasis: 220,
    minWidth: 200,
  },
});
