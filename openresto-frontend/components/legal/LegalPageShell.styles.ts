import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

/** About 75 characters of body text per line at the document's type size. */
export const LEGAL_READING_WIDTH = 720;

export const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1 },
  column: {
    width: "100%",
    maxWidth: LEGAL_READING_WIDTH,
    gap: theme.spacing.lg,
    paddingVertical: theme.spacing.xxl,
  },
});
