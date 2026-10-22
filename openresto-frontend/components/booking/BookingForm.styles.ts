import { StyleSheet } from "react-native";
import { theme } from "@/theme/theme";

const CONFIRM_BAR_GAP = 12;
const CONFIRM_BAR_PADDING_TOP = 12;
/** The line of hint under the button, at the form's 12px hint size. */
const CONFIRM_BAR_HINT_LINE = 16;

/**
 * How much of the sheet's scrollport the sticky confirm bar covers at the bottom: the sheet's
 * scroller keeps this much clear (`scroll-padding-bottom`), or a field the keyboard focuses is
 * counted as visible while sitting behind the bar (WCAG 2.2, 2.4.11 Focus Not Obscured).
 */
export const CONFIRM_BAR_CLEARANCE =
  theme.buttonSizes.lg.minHeight +
  CONFIRM_BAR_GAP +
  CONFIRM_BAR_HINT_LINE +
  CONFIRM_BAR_PADDING_TOP;

export const styles = StyleSheet.create({
  form: {
    gap: 20,
  },
  availabilityHeader: {
    width: "100%",
    overflow: "hidden",
  },
  availabilityLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  drawerForm: {
    gap: 20,
  },
  drawerSection: {
    gap: 12,
  },
  /** The confirm and what it waits on; the sheet's own fill and a hairline set it off while it rides over the form. */
  confirmBar: {
    gap: CONFIRM_BAR_GAP,
    paddingTop: CONFIRM_BAR_PADDING_TOP,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  divider: {
    height: 1,
    marginVertical: 2,
  },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  drawerRow: {
    flexDirection: "row",
    gap: 12,
  },
  // Halves rather than content-sized: the guests and date controls carry different label
  // lengths, and a split row is the only thing keeping them off one column each.
  drawerRowHalf: {
    flex: 1,
    minWidth: 0,
  },
  disclosureToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 28,
  },
  disclosureText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  fieldRow: {
    flexDirection: "row",
    gap: 16,
  },
  fieldRowStretch: {
    alignItems: "stretch",
  },
  // Stacked, the pair's two fields are plain siblings with no gap of their own,
  // so without this they'd sit tighter together than consecutive rows do.
  fieldRowStacked: {
    gap: 20,
  },
  holdPush: {
    marginTop: "auto",
  },
  field: {
    gap: 6,
  },
  fieldHalf: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
  noTables: {
    fontSize: 13,
  },
  autoAssignHint: {
    fontSize: 13,
    fontStyle: "italic",
  },
  closedDayNotice: {
    fontSize: 13,
  },
  timezoneHint: {
    fontSize: 12,
    marginTop: -10,
  },
  // The inline layout pulls the hint up against the row above it; inside a drawer
  // section it is a normal sibling with the section's own gap.
  timezoneHintDrawer: {
    marginTop: 0,
  },
  textarea: {
    height: 80,
    textAlignVertical: "top",
    paddingTop: 10,
  },
  // colors.muted at full opacity, not a faded text color: 0.5 opacity fell below WCAG AA
  // contrast in light mode.
  hint: {
    fontSize: 12,
    textAlign: "center",
    marginTop: -10,
  },
  gdpr: {
    fontSize: 12,
    lineHeight: 18,
  },
});
