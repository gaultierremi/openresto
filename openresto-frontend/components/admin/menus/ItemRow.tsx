import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import { RowTextButton } from "@/components/common/RowTextButton";
import { ItemEditor } from "@/components/admin/menus/ItemEditor";
import { MoveButtons } from "@/components/admin/menus/MoveButtons";
import { usePriceLabel } from "@/components/menu/MenuItemRow";
import { adminSetItemAvailability, type MenuDto, type MenuItemDto } from "@/api/menus";
import { useAppTheme } from "@/hooks/use-app-theme";
import { removeItem, replaceItem } from "@/utils/menuState";
import { theme } from "@/theme/theme";
import { styles } from "./ItemRow.styles";

/**
 * One dish in the editor: its name, price and availability on a line, the sold-out toggle and
 * the reorder arrows beside them, and the full editor one press away. The toggle is here as
 * well as on the service screen because the admin is already looking at the dish.
 *
 * @see [ItemRow.test.tsx](../../../tests/components/admin/menus/ItemRow.test.tsx) — pins the
 * toggle in both directions, that a refusal leaves the dish as it was and says so, and that the
 * editor opens and closes.
 */
export function ItemRow({
  restaurantId,
  item,
  currency,
  isFirst,
  isLast,
  reorderBusy,
  onMove,
  onTree,
}: {
  restaurantId: number;
  item: MenuItemDto;
  currency: string;
  isFirst: boolean;
  isLast: boolean;
  reorderBusy: boolean;
  onMove: (direction: -1 | 1) => void;
  onTree: (patch: (menus: MenuDto[]) => MenuDto[]) => void;
}) {
  const { t } = useTranslation();
  const { colors, primaryColor } = useAppTheme();
  const priceLabel = usePriceLabel();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const soldOut = item.availability === "SoldOut";

  const toggleSoldOut = async () => {
    setError(null);
    const result = await adminSetItemAvailability(
      restaurantId,
      item,
      soldOut ? "Available" : "SoldOut"
    );
    if (result.ok) onTree((menus) => replaceItem(menus, result.value));
    else setError(result.message);
  };

  return (
    <View style={[styles.item, { borderColor: colors.border }]} testID="item-row">
      <View style={styles.line}>
        <View style={styles.summary}>
          <ThemedText style={[styles.name, item.availability === "Hidden" && styles.dimmed]}>
            {item.name}
          </ThemedText>
          <ThemedText style={[styles.meta, { color: colors.muted }]}>
            {priceLabel(item.priceMinor, currency)}
            {item.availability !== "Available"
              ? ` · ${t(`common.menu.availability.${item.availability}`)}`
              : ""}
          </ThemedText>
        </View>
        <View style={styles.actions}>
          {item.availability !== "Hidden" && (
            <RowTextButton
              testID={`item-sold-out-${item.id}`}
              label={t("common.menu.availability.SoldOut")}
              accessibilityLabel={
                soldOut
                  ? t("admin.menus.item.markAvailable", { name: item.name })
                  : t("admin.menus.item.markSoldOut", { name: item.name })
              }
              color={theme.colors.warning}
              selected={soldOut}
              onPress={toggleSoldOut}
            />
          )}
          <MoveButtons
            name={item.name}
            isFirst={isFirst}
            isLast={isLast}
            busy={reorderBusy}
            onMove={onMove}
            testIDPrefix={`item-${item.id}`}
          />
          <RowTextButton
            testID={`item-edit-${item.id}`}
            label={open ? t("admin.menus.item.close") : t("admin.menus.item.edit")}
            accessibilityLabel={
              open
                ? t("admin.menus.item.closeNamed", { name: item.name })
                : t("admin.menus.item.editNamed", { name: item.name })
            }
            color={primaryColor}
            icon={open ? "chevron-up" : "chevron-down"}
            onPress={() => setOpen((v) => !v)}
          />
        </View>
      </View>
      {error && (
        <ThemedText style={[styles.error, { color: colors.error }]} role="alert">
          {error}
        </ThemedText>
      )}
      {open && (
        <ItemEditor
          restaurantId={restaurantId}
          item={item}
          currency={currency}
          onChanged={(next) => onTree((menus) => replaceItem(menus, next))}
          onDeleted={(id) => onTree((menus) => removeItem(menus, id))}
        />
      )}
    </View>
  );
}
