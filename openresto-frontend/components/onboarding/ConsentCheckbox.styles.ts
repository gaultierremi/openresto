import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const BOX_SIZE = 24;

export const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.md,
  },
  box: {
    width: BOX_SIZE,
    height: BOX_SIZE,
    borderWidth: 2,
    borderRadius: theme.borderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 14,
    lineHeight: 20,
  },
  link: {
    fontSize: 13,
    fontWeight: "600",
  },
});
