import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

/** The pieces the platform dialogs share: a labelled field, a boxed notice, the closing button cluster. */
export const styles = StyleSheet.create({
  intro: { fontSize: 14, lineHeight: 20 },
  field: { gap: theme.spacing.xs },
  label: { fontSize: 12, fontWeight: "600", lineHeight: 16 },
  hint: { fontSize: 12, lineHeight: 17 },
  counter: { fontSize: 12, lineHeight: 17, textAlign: "right" },
  multiline: { minHeight: 88, textAlignVertical: "top" },
  error: { fontSize: 13, lineHeight: 18 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
  },
  noticeIcon: { marginTop: 1 },
  noticeBody: { flex: 1, gap: 4 },
  noticeTitle: { fontSize: 13, fontWeight: "700", lineHeight: 18 },
  noticeText: { fontSize: 13, lineHeight: 18 },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.lg,
    borderTopWidth: 1,
  },
});
