import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing.sm,
  },
  // The field takes what Copy leaves; below 180px it wraps Copy onto its own line instead.
  linkField: { flex: 1, minWidth: 180 },
});
