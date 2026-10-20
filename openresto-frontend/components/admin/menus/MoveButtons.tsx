import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { RowIconButton } from "@/components/admin/settings/RowIconButton";
import { useAppTheme } from "@/hooks/use-app-theme";
import { styles } from "./MoveButtons.styles";

/**
 * The up/down pair that reorders a list. Reordering is arrows rather than drag-and-drop: a
 * drag has no keyboard path and none on a phone's touch screen without a gesture library this
 * app does not carry, while a pair of labelled buttons works the same on a tablet, a mouse and
 * a screen reader. A move is disabled at either end of the list, and while a previous one is
 * still on its way to the server.
 *
 * @see [MoveButtons.test.tsx](../../../tests/components/admin/menus/MoveButtons.test.tsx) —
 * pins that each end disables its arrow and that a busy list disables both.
 */
export function MoveButtons({
  name,
  isFirst,
  isLast,
  busy = false,
  onMove,
  testIDPrefix,
}: {
  /** What is being moved, so the buttons can say "Move Starters up" rather than "Move up". */
  name: string;
  isFirst: boolean;
  isLast: boolean;
  busy?: boolean;
  onMove: (direction: -1 | 1) => void;
  testIDPrefix: string;
}) {
  const { t } = useTranslation();
  const { colors, primaryColor } = useAppTheme();

  return (
    <View style={styles.pair}>
      <RowIconButton
        testID={`${testIDPrefix}-move-up`}
        name="arrow-up-outline"
        color={isFirst || busy ? colors.muted : primaryColor}
        disabled={isFirst || busy}
        accessibilityLabel={t("admin.menus.moveUp", { name })}
        onPress={() => onMove(-1)}
      />
      <RowIconButton
        testID={`${testIDPrefix}-move-down`}
        name="arrow-down-outline"
        color={isLast || busy ? colors.muted : primaryColor}
        disabled={isLast || busy}
        accessibilityLabel={t("admin.menus.moveDown", { name })}
        onPress={() => onMove(1)}
      />
    </View>
  );
}
