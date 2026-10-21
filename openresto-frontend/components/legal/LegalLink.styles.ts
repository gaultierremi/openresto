import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const styles = StyleSheet.create({
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.xs,
    minHeight: 44,
    alignSelf: "flex-start",
  },
  label: { fontSize: 15, fontWeight: "600", lineHeight: 22, textDecorationLine: "underline" },
});
