import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  group: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.md,
  },
  option: {
    flexGrow: 1,
    flexBasis: 140,
    maxWidth: 200,
    borderWidth: 2,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  swatch: {
    height: 72,
    padding: theme.spacing.sm,
    gap: 6,
    justifyContent: "center",
  },
  bar: {
    height: 10,
    width: "55%",
  },
  line: {
    height: 5,
    borderRadius: 3,
  },
  name: {
    fontSize: 15,
    fontWeight: "700",
  },
  description: {
    fontSize: 12,
    lineHeight: 17,
  },
});
