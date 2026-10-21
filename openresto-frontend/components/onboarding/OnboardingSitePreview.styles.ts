import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

export const PHONE_WIDTH = 390;
export const PREVIEW_HEIGHT = 560;

export const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing.sm,
  },
  status: {
    fontSize: 14,
  },
});
