import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  form: {
    gap: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
  },
  fields: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  nameField: {
    flex: 3,
    minWidth: 200,
  },
  priceField: {
    flex: 1,
    minWidth: 100,
  },
  error: {
    fontSize: 13,
  },
});
