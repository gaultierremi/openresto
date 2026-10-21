import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Input from "@/components/common/Input";
import ConfirmModal from "@/components/common/ConfirmModal";
import { RowTextButton } from "@/components/common/RowTextButton";
import { AddEntryForm } from "@/components/admin/menus/AddEntryForm";
import { ItemRow } from "@/components/admin/menus/ItemRow";
import { MoveButtons } from "@/components/admin/menus/MoveButtons";
import { SaveStatus } from "@/components/admin/settings/SaveStatus";
import {
  adminCreateItem,
  adminDeleteCategory,
  adminReorderItems,
  adminUpdateCategory,
  type MenuCategoryDto,
  type MenuDto,
  type SaveCategoryInput,
} from "@/api/menus";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useAutosave } from "@/hooks/use-autosave";
import { MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH } from "@/constants/menu";
import { parsePrice } from "@/utils/menuPrice";
import { moveId } from "@/utils/reorder";
import { addItem, removeCategory, reorderItems, replaceCategory } from "@/utils/menuState";
import { styles } from "./CategoryBlock.styles";

/**
 * A category and its dishes. Its own fields autosave; its dishes each carry their own editor.
 * Adding a dish with no price creates it as "price on request" rather than refusing, because
 * a chef drafting a menu often has the dishes before the prices.
 *
 * @see [CategoryBlock.test.tsx](../../../tests/components/admin/menus/CategoryBlock.test.tsx) —
 * pins the autosaved fields, the dish creation with and without a price, the reorder with its
 * rollback, and the delete confirmation.
 */
export function CategoryBlock({
  restaurantId,
  category,
  currency,
  isFirst,
  isLast,
  reorderBusy,
  onMove,
  onTree,
}: {
  restaurantId: number;
  category: MenuCategoryDto;
  currency: string;
  isFirst: boolean;
  isLast: boolean;
  reorderBusy: boolean;
  onMove: (direction: -1 | 1) => void;
  onTree: (patch: (menus: MenuDto[]) => MenuDto[]) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description ?? "");
  const [isVisible, setIsVisible] = useState(category.isVisible);
  const [itemsBusy, setItemsBusy] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const values: SaveCategoryInput = {
    name: name.trim(),
    description: description.trim() || null,
    isVisible,
  };
  const saved: SaveCategoryInput = {
    name: category.name,
    description: category.description,
    isVisible: category.isVisible,
  };

  const { status, error, retry, undo } = useAutosave<SaveCategoryInput>({
    values,
    saved,
    canSave: name.trim().length > 0,
    save: async (payload) => {
      const result = await adminUpdateCategory(restaurantId, category.id, payload);
      if (!result.ok) return result.message;
      onTree((menus) => replaceCategory(menus, result.value));
      return null;
    },
    onRestore: (previous) => {
      setName(previous.name);
      setDescription(previous.description ?? "");
      setIsVisible(previous.isVisible);
    },
  });

  const addDish = async (dishName: string, priceText: string): Promise<string | null> => {
    const trimmed = priceText.trim();
    const priceMinor = trimmed === "" ? null : parsePrice(trimmed, currency);
    if (trimmed !== "" && priceMinor === null) return t("admin.menus.item.addPriceInvalid");

    const result = await adminCreateItem(restaurantId, category.id, {
      name: dishName,
      description: null,
      priceMinor,
      availability: "Available",
      allergens: [],
      dietaryTags: [],
    });
    if (!result.ok) return result.message;
    onTree((menus) => addItem(menus, category.id, result.value));
    return null;
  };

  const moveItem = async (index: number, direction: -1 | 1) => {
    const before = category.items.map((item) => item.id);
    const after = moveId(before, index, direction);
    if (!after) return;
    setItemsBusy(true);
    setMoveError(null);
    onTree((menus) => reorderItems(menus, category.id, after));
    const result = await adminReorderItems(restaurantId, category.id, after);
    setItemsBusy(false);
    if (!result.ok) {
      onTree((menus) => reorderItems(menus, category.id, before));
      setMoveError(result.message);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    const result = await adminDeleteCategory(restaurantId, category.id);
    setDeleting(false);
    if (result.ok) onTree((menus) => removeCategory(menus, category.id));
    else {
      setConfirmingDelete(false);
      setDeleteError(result.message);
    }
  };

  return (
    <View
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}
      testID="category-block"
    >
      <View style={styles.header}>
        <View style={styles.nameField}>
          <Input
            value={name}
            onChangeText={setName}
            maxLength={MAX_NAME_LENGTH}
            accessibilityLabel={t("admin.menus.category.nameLabel")}
            testID="category-name"
          />
        </View>
        <View style={styles.headerActions}>
          <RowTextButton
            testID={`category-visible-${category.id}`}
            label={isVisible ? t("admin.menus.category.visible") : t("admin.menus.category.hidden")}
            accessibilityLabel={
              isVisible
                ? t("admin.menus.category.hideNamed", { name: category.name })
                : t("admin.menus.category.showNamed", { name: category.name })
            }
            color={colors.muted}
            icon={isVisible ? "eye-outline" : "eye-off-outline"}
            onPress={() => setIsVisible((v) => !v)}
          />
          <MoveButtons
            name={category.name}
            isFirst={isFirst}
            isLast={isLast}
            busy={reorderBusy}
            onMove={onMove}
            testIDPrefix={`category-${category.id}`}
          />
          <RowTextButton
            testID={`category-delete-${category.id}`}
            label={t("common.actions.delete")}
            accessibilityLabel={t("admin.menus.category.deleteNamed", { name: category.name })}
            color={colors.error}
            onPress={() => setConfirmingDelete(true)}
          />
        </View>
      </View>

      <View style={styles.descriptionField}>
        <Input
          value={description}
          onChangeText={setDescription}
          maxLength={MAX_DESCRIPTION_LENGTH}
          placeholder={t("admin.menus.category.descriptionPlaceholder")}
          accessibilityLabel={t("admin.menus.category.descriptionLabel")}
          testID="category-description"
        />
      </View>
      <View style={styles.status}>
        <SaveStatus
          status={status}
          error={error}
          onRetry={retry}
          onUndo={undo}
          mutedColor={colors.muted}
          blockedReason={name.trim() ? null : t("admin.menus.category.nameRequired")}
          testID="category-save-status"
        />
      </View>
      {(moveError || deleteError) && (
        <ThemedText style={[styles.error, { color: colors.error }]} role="alert">
          {moveError ?? deleteError}
        </ThemedText>
      )}

      {category.items.length === 0 ? (
        <ThemedText style={[styles.empty, { color: colors.muted }]}>
          {t("admin.menus.category.noItems")}
        </ThemedText>
      ) : (
        category.items.map((item, index) => (
          <ItemRow
            key={item.id}
            restaurantId={restaurantId}
            item={item}
            currency={currency}
            isFirst={index === 0}
            isLast={index === category.items.length - 1}
            reorderBusy={itemsBusy}
            onMove={(direction) => moveItem(index, direction)}
            onTree={onTree}
          />
        ))
      )}

      <View style={styles.add}>
        <AddEntryForm
          label={t("admin.menus.addItem")}
          placeholder={t("admin.menus.addItemPlaceholder")}
          pricePlaceholder={t("admin.menus.addItemPrice")}
          onAdd={addDish}
          testID={`add-item-${category.id}`}
        />
      </View>

      <ConfirmModal
        visible={confirmingDelete}
        destructive
        loading={deleting}
        title={t("admin.menus.category.deleteTitle")}
        message={t("admin.menus.category.deleteMessage", {
          name: category.name,
          count: category.items.length,
        })}
        confirmLabel={t("common.actions.delete")}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </View>
  );
}
