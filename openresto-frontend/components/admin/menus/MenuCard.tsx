import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Input from "@/components/common/Input";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import ConfirmModal from "@/components/common/ConfirmModal";
import Select from "@/components/common/Select";
import { RowTextButton } from "@/components/common/RowTextButton";
import { AddEntryForm } from "@/components/admin/menus/AddEntryForm";
import { CategoryBlock } from "@/components/admin/menus/CategoryBlock";
import { MoveButtons } from "@/components/admin/menus/MoveButtons";
import { SaveStatus } from "@/components/admin/settings/SaveStatus";
import {
  adminCreateCategory,
  adminDeleteMenu,
  adminReorderCategories,
  adminSetMenuPublished,
  adminUpdateMenu,
  type MenuDto,
  type SaveMenuInput,
} from "@/api/menus";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useAutosave } from "@/hooks/use-autosave";
import { COMMON_CURRENCIES, MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH } from "@/constants/menu";
import { moveId } from "@/utils/reorder";
import {
  addCategory,
  countItems,
  removeMenu,
  reorderCategories,
  replaceMenu,
} from "@/utils/menuState";
import { theme } from "@/theme/theme";
import { styles } from "./MenuCard.styles";

/**
 * One menu: its publication state and ordering on the header, its own fields and its
 * categories in the body. Publishing is a button, not an autosaved field, because it is the
 * step that puts the menu in front of guests and the admin should mean it.
 *
 * @see [MenuCard.test.tsx](../../../tests/components/admin/menus/MenuCard.test.tsx) — pins
 * publish and unpublish, the autosaved fields, the category creation, the reorder with its
 * rollback and the delete confirmation.
 */
export function MenuCard({
  restaurantId,
  menu,
  isFirst,
  isLast,
  reorderBusy,
  onMove,
  onTree,
  defaultOpen = false,
}: {
  restaurantId: number;
  menu: MenuDto;
  isFirst: boolean;
  isLast: boolean;
  reorderBusy: boolean;
  onMove: (direction: -1 | 1) => void;
  onTree: (patch: (menus: MenuDto[]) => MenuDto[]) => void;
  defaultOpen?: boolean;
}) {
  const { t } = useTranslation();
  const { colors, primaryColor } = useAppTheme();

  const [open, setOpen] = useState(defaultOpen);
  const [name, setName] = useState(menu.name);
  const [description, setDescription] = useState(menu.description ?? "");
  const [currency, setCurrency] = useState(menu.currency);
  const [publishing, setPublishing] = useState(false);
  const [categoriesBusy, setCategoriesBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const values: SaveMenuInput = {
    name: name.trim(),
    description: description.trim() || null,
    currency,
  };
  const saved: SaveMenuInput = {
    name: menu.name,
    description: menu.description,
    currency: menu.currency,
  };

  const { status, error, retry, undo } = useAutosave<SaveMenuInput>({
    values,
    saved,
    canSave: name.trim().length > 0,
    save: async (payload) => {
      const result = await adminUpdateMenu(restaurantId, menu.id, payload);
      if (!result.ok) return result.message;
      onTree((menus) => replaceMenu(menus, result.value));
      return null;
    },
    onRestore: (previous) => {
      setName(previous.name);
      setDescription(previous.description ?? "");
      setCurrency(previous.currency);
    },
  });

  const currencyOptions = (
    COMMON_CURRENCIES.includes(currency as (typeof COMMON_CURRENCIES)[number])
      ? [...COMMON_CURRENCIES]
      : [currency, ...COMMON_CURRENCIES]
  ).map((code) => ({ label: code, value: code }));

  const togglePublished = async () => {
    setPublishing(true);
    setProblem(null);
    const result = await adminSetMenuPublished(restaurantId, menu.id, !menu.isPublished);
    setPublishing(false);
    if (result.ok) onTree((menus) => replaceMenu(menus, result.value));
    else setProblem(result.message);
  };

  const addCategoryEntry = async (categoryName: string): Promise<string | null> => {
    const result = await adminCreateCategory(restaurantId, menu.id, {
      name: categoryName,
      description: null,
      isVisible: true,
    });
    if (!result.ok) return result.message;
    onTree((menus) => addCategory(menus, menu.id, result.value));
    return null;
  };

  const moveCategory = async (index: number, direction: -1 | 1) => {
    const before = menu.categories.map((category) => category.id);
    const after = moveId(before, index, direction);
    if (!after) return;
    setCategoriesBusy(true);
    setProblem(null);
    onTree((menus) => reorderCategories(menus, menu.id, after));
    const result = await adminReorderCategories(restaurantId, menu.id, after);
    setCategoriesBusy(false);
    if (!result.ok) {
      onTree((menus) => reorderCategories(menus, menu.id, before));
      setProblem(result.message);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setProblem(null);
    const result = await adminDeleteMenu(restaurantId, menu.id);
    setDeleting(false);
    if (result.ok) onTree((menus) => removeMenu(menus, menu.id));
    else {
      setConfirmingDelete(false);
      setProblem(result.message);
    }
  };

  const itemCount = countItems(menu);

  return (
    <View
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}
      testID="menu-card"
    >
      <View style={styles.header}>
        <View style={styles.title}>
          <View style={styles.nameLine}>
            <ThemedText type="h3" testID="menu-card-name">
              {menu.name}
            </ThemedText>
            <View
              style={[
                styles.badge,
                menu.isPublished
                  ? { backgroundColor: theme.badge.active.bg }
                  : { backgroundColor: colors.surfaceAlt },
              ]}
              testID="menu-status"
            >
              <ThemedText
                style={[
                  styles.badgeText,
                  { color: menu.isPublished ? theme.badge.active.text : colors.muted },
                ]}
              >
                {menu.isPublished ? t("admin.menus.menu.published") : t("admin.menus.menu.draft")}
              </ThemedText>
            </View>
          </View>
          <ThemedText style={[styles.summary, { color: colors.muted }]}>
            {t("admin.menus.menu.categoryCount", { count: menu.categories.length })}
            {" · "}
            {t("admin.menus.menu.itemCount", { count: itemCount })}
            {" · "}
            {menu.currency}
          </ThemedText>
        </View>
        <View style={styles.headerActions}>
          <Button
            size="md"
            variant={menu.isPublished ? "secondary" : "primary"}
            tone={menu.isPublished ? "neutral" : "brand"}
            loading={publishing}
            onPress={togglePublished}
            testID={`menu-publish-${menu.id}`}
          >
            {menu.isPublished ? t("admin.menus.menu.unpublish") : t("admin.menus.menu.publish")}
          </Button>
          <MoveButtons
            name={menu.name}
            isFirst={isFirst}
            isLast={isLast}
            busy={reorderBusy}
            onMove={onMove}
            testIDPrefix={`menu-${menu.id}`}
          />
          <RowTextButton
            testID={`menu-toggle-${menu.id}`}
            label={open ? t("admin.menus.menu.close") : t("admin.menus.menu.open")}
            accessibilityLabel={
              open
                ? t("admin.menus.menu.closeNamed", { name: menu.name })
                : t("admin.menus.menu.openNamed", { name: menu.name })
            }
            color={primaryColor}
            icon={open ? "chevron-up" : "chevron-down"}
            onPress={() => setOpen((v) => !v)}
          />
        </View>
      </View>

      {problem && (
        <ThemedText style={[styles.error, { color: colors.error }]} role="alert">
          {problem}
        </ThemedText>
      )}

      {open && (
        <View style={[styles.body, { borderTopColor: colors.border }]}>
          <View style={styles.fields}>
            <View style={styles.field}>
              <ThemedText style={styles.label}>{t("admin.menus.menu.nameLabel")}</ThemedText>
              <Input
                value={name}
                onChangeText={setName}
                maxLength={MAX_NAME_LENGTH}
                accessibilityLabel={t("admin.menus.menu.nameLabel")}
                testID="menu-name"
              />
            </View>
            <View style={styles.field}>
              <ThemedText style={styles.label}>{t("admin.menus.menu.descriptionLabel")}</ThemedText>
              <Input
                value={description}
                onChangeText={setDescription}
                maxLength={MAX_DESCRIPTION_LENGTH}
                accessibilityLabel={t("admin.menus.menu.descriptionLabel")}
                testID="menu-description"
              />
            </View>
            <View style={styles.currency}>
              <ThemedText style={styles.label}>{t("admin.menus.menu.currencyLabel")}</ThemedText>
              <Select
                options={currencyOptions}
                selectedValue={currency}
                onSelect={(value) => setCurrency(String(value))}
                accessibilityLabel={t("admin.menus.menu.currencyLabel")}
              />
              <ThemedText style={[styles.hint, { color: colors.muted }]}>
                {t("admin.menus.menu.currencyHint")}
              </ThemedText>
            </View>
            <SaveStatus
              status={status}
              error={error}
              onRetry={retry}
              onUndo={undo}
              mutedColor={colors.muted}
              blockedReason={name.trim() ? null : t("admin.menus.menu.nameRequired")}
              testID="menu-save-status"
            />
          </View>

          <View style={styles.categories}>
            {menu.categories.map((category, index) => (
              <CategoryBlock
                key={category.id}
                restaurantId={restaurantId}
                category={category}
                currency={menu.currency}
                isFirst={index === 0}
                isLast={index === menu.categories.length - 1}
                reorderBusy={categoriesBusy}
                onMove={(direction) => moveCategory(index, direction)}
                onTree={onTree}
              />
            ))}
            <AddEntryForm
              label={t("admin.menus.addCategory")}
              placeholder={t("admin.menus.addCategoryPlaceholder")}
              onAdd={addCategoryEntry}
              testID={`add-category-${menu.id}`}
            />
          </View>

          <ButtonRow align="start">
            <Button
              size="md"
              variant="secondary"
              tone="danger"
              icon="trash-outline"
              onPress={() => setConfirmingDelete(true)}
              testID={`menu-delete-${menu.id}`}
            >
              {t("admin.menus.menu.delete")}
            </Button>
          </ButtonRow>
        </View>
      )}

      <ConfirmModal
        visible={confirmingDelete}
        destructive
        loading={deleting}
        title={t("admin.menus.menu.deleteTitle")}
        message={t("admin.menus.menu.deleteMessage", { name: menu.name })}
        confirmLabel={t("admin.menus.menu.delete")}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </View>
  );
}
