import { useRef, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Input from "@/components/common/Input";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import ConfirmModal from "@/components/common/ConfirmModal";
import { FilterChip } from "@/components/menu/MenuFilters";
import { MenuPhoto } from "@/components/menu/MenuPhoto";
import { DishTranslationFields } from "@/components/menu/DishTranslationFields";
import { SaveStatus } from "@/components/admin/settings/SaveStatus";
import {
  adminDeleteItem,
  adminDeleteItemPhoto,
  adminSetItemAvailability,
  adminUpdateItem,
  adminUploadItemPhoto,
  itemToInput,
  type MenuItemDto,
  type SaveItemInput,
  type DishLanguage,
  type DishTranslations,
} from "@/api/menus";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useAutosave } from "@/hooks/use-autosave";
import {
  ALLERGENS,
  AVAILABILITIES,
  DIETARY_TAGS,
  MAX_DESCRIPTION_LENGTH,
  MAX_NAME_LENGTH,
  PHOTO_MAX_BYTES,
  PHOTO_TYPES,
  type Allergen,
  type Availability,
  type DietaryTag,
} from "@/constants/menu";
import { parsePrice, priceToInput } from "@/utils/menuPrice";
import { pickFile } from "@/utils/pickFile";
import { toggleIn } from "@/utils/menuFilter";
import { styles } from "./ItemEditor.styles";

const PHOTO_PREVIEW_SIZE = 96;

/** The form's text and ticks back into the payload the API takes, in the API's canonical order. */
function toPayload(fields: {
  primaryLanguage?: DishLanguage;
  translations?: DishTranslations;
  name: string;
  description: string;
  priceText: string;
  onRequest: boolean;
  allergens: Allergen[];
  dietaryTags: DietaryTag[];
  currency: string;
  availability: Availability;
}): SaveItemInput {
  return {
    primaryLanguage: fields.primaryLanguage,
    translations: fields.translations,
    name: fields.name.trim(),
    description: fields.description.trim() || null,
    priceMinor: fields.onRequest ? null : parsePrice(fields.priceText, fields.currency),
    availability: fields.availability,
    allergens: ALLERGENS.filter((a) => fields.allergens.includes(a)),
    dietaryTags: DIETARY_TAGS.filter((d) => fields.dietaryTags.includes(d)),
  };
}

/**
 * Everything about one dish, autosaved like the rest of the admin's record editors. Two things
 * sit outside the autosave on purpose: availability, which is a press with an immediate effect
 * (the same call the sold-out toggle makes, so the two cannot disagree about what a press does),
 * and the photo, which is its own upload endpoint. Availability is read from the dish rather
 * than held in the form, so a sold-out toggle pressed elsewhere is never overwritten by a stale
 * copy of it the next time a text field saves.
 *
 * @see [ItemEditor.test.tsx](../../../tests/components/admin/menus/ItemEditor.test.tsx) — pins
 * the autosaved fields, the withheld save on a name or price the API would refuse, that
 * availability is not part of that save, and the photo and delete paths.
 */
export function ItemEditor({
  restaurantId,
  item,
  currency,
  onChanged,
  onDeleted,
}: {
  restaurantId: number;
  item: MenuItemDto;
  currency: string;
  onChanged: (item: MenuItemDto) => void;
  onDeleted: (id: number) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [primaryLanguage, setPrimaryLanguage] = useState(item.primaryLanguage);
  const [translations, setTranslations] = useState(item.translations);
  const [onRequest, setOnRequest] = useState(item.priceMinor === null);
  const [priceText, setPriceText] = useState(
    item.priceMinor === null ? "" : priceToInput(item.priceMinor, currency)
  );
  const [allergens, setAllergens] = useState<Allergen[]>(item.allergens);
  const [dietaryTags, setDietaryTags] = useState<DietaryTag[]>(item.dietaryTags);

  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // The save reads the dish's availability at the moment it fires, not when the form was drawn.
  const latest = useRef(item);
  latest.current = item;

  const priceValid = onRequest || parsePrice(priceText, currency) !== null;
  const canSave = name.trim().length > 0 && priceValid;

  const values = toPayload({
    primaryLanguage,
    translations,
    name,
    description,
    priceText,
    onRequest,
    allergens,
    dietaryTags,
    currency,
    availability: item.availability,
  });
  const saved = itemToInput(item);

  const { status, error, retry, undo } = useAutosave<SaveItemInput>({
    values,
    saved,
    canSave,
    save: async (payload) => {
      const result = await adminUpdateItem(restaurantId, item.id, {
        ...payload,
        availability: latest.current.availability,
      });
      if (!result.ok) return result.message;
      onChanged(result.value);
      return null;
    },
    onRestore: (previous) => {
      setPrimaryLanguage(previous.primaryLanguage);
      setTranslations(previous.translations);
      setName(previous.name);
      setDescription(previous.description ?? "");
      setOnRequest(previous.priceMinor === null);
      setPriceText(previous.priceMinor === null ? "" : priceToInput(previous.priceMinor, currency));
      setAllergens(previous.allergens);
      setDietaryTags(previous.dietaryTags);
    },
  });

  const blockedReason = !name.trim()
    ? t("admin.menus.item.nameRequired")
    : !priceValid
      ? t("admin.menus.item.priceInvalid")
      : null;

  const chooseAvailability = async (next: Availability) => {
    if (next === item.availability) return;
    setAvailabilityError(null);
    const result = await adminSetItemAvailability(restaurantId, item, next);
    if (result.ok) onChanged(result.value);
    else setAvailabilityError(result.message);
  };

  const uploadPhoto = async () => {
    const file = await pickFile(PHOTO_TYPES.join(","));
    if (!file) return;
    if (!(PHOTO_TYPES as readonly string[]).includes(file.type)) {
      setPhotoError(t("errors.media.unsupported_image_type"));
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setPhotoError(t("errors.menu.item_image_too_large"));
      return;
    }
    setPhotoBusy(true);
    setPhotoError(null);
    const result = await adminUploadItemPhoto(restaurantId, item.id, file);
    setPhotoBusy(false);
    if (result.ok) onChanged(result.value);
    else setPhotoError(result.message);
  };

  const removePhoto = async () => {
    setPhotoBusy(true);
    setPhotoError(null);
    const result = await adminDeleteItemPhoto(restaurantId, item.id);
    setPhotoBusy(false);
    if (result.ok) onChanged({ ...item, imageUrl: null });
    else setPhotoError(result.message);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    const result = await adminDeleteItem(restaurantId, item.id);
    setDeleting(false);
    if (result.ok) onDeleted(item.id);
    else {
      setConfirmingDelete(false);
      setDeleteError(result.message);
    }
  };

  return (
    <View style={[styles.editor, { borderColor: colors.border }]} testID="item-editor">
      <View style={styles.field}>
        <ThemedText style={styles.label}>{t("admin.menus.item.nameLabel")}</ThemedText>
        <Input
          value={name}
          onChangeText={setName}
          maxLength={MAX_NAME_LENGTH}
          accessibilityLabel={t("admin.menus.item.nameLabel")}
          testID="item-name"
        />
      </View>

      <View style={styles.field}>
        <ThemedText style={styles.label}>{t("admin.menus.item.descriptionLabel")}</ThemedText>
        <Input
          value={description}
          onChangeText={setDescription}
          maxLength={MAX_DESCRIPTION_LENGTH}
          multiline
          numberOfLines={3}
          style={styles.multiline}
          accessibilityLabel={t("admin.menus.item.descriptionLabel")}
          testID="item-description"
        />
      </View>

      <DishTranslationFields
        primaryLanguage={primaryLanguage ?? "fr"}
        translations={translations ?? {}}
        onChange={(language, values) => {
          setPrimaryLanguage(language);
          setTranslations(values);
        }}
        testID="item"
      />

      <View style={styles.field}>
        <ThemedText style={styles.label}>
          {t("admin.menus.item.priceLabel", { currency })}
        </ThemedText>
        <View style={styles.priceRow}>
          <View style={styles.priceInput}>
            <Input
              value={priceText}
              onChangeText={setPriceText}
              editable={!onRequest}
              keyboardType="decimal-pad"
              placeholder="0.00"
              accessibilityLabel={t("admin.menus.item.priceLabel", { currency })}
              testID="item-price"
            />
          </View>
          <FilterChip
            testID="item-price-on-request"
            label={t("common.menu.priceOnRequest")}
            selected={onRequest}
            onPress={() => setOnRequest((v) => !v)}
          />
        </View>
      </View>

      <View style={styles.field}>
        <ThemedText style={styles.label}>{t("admin.menus.item.availabilityLabel")}</ThemedText>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {AVAILABILITIES.map((value) => (
            <FilterChip
              key={value}
              role="radio"
              testID={`item-availability-${value}`}
              label={t(`common.menu.availability.${value}`)}
              selected={item.availability === value}
              onPress={() => chooseAvailability(value)}
            />
          ))}
        </View>
        {availabilityError && (
          <ThemedText style={[styles.error, { color: colors.error }]} role="alert">
            {availabilityError}
          </ThemedText>
        )}
      </View>

      <View style={styles.field}>
        <ThemedText style={styles.label}>{t("admin.menus.item.allergensLabel")}</ThemedText>
        <ThemedText style={[styles.hint, { color: colors.muted }]}>
          {t("admin.menus.item.allergensHint")}
        </ThemedText>
        <View style={styles.chips}>
          {ALLERGENS.map((allergen) => (
            <FilterChip
              key={allergen}
              testID={`item-allergen-${allergen}`}
              label={t(`common.menu.allergens.${allergen}`)}
              selected={allergens.includes(allergen)}
              onPress={() => setAllergens((list) => toggleIn(list, allergen))}
            />
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <ThemedText style={styles.label}>{t("admin.menus.item.dietaryLabel")}</ThemedText>
        <View style={styles.chips}>
          {DIETARY_TAGS.map((tag) => (
            <FilterChip
              key={tag}
              testID={`item-diet-${tag}`}
              label={t(`common.menu.dietary.${tag}`)}
              selected={dietaryTags.includes(tag)}
              onPress={() => setDietaryTags((list) => toggleIn(list, tag))}
            />
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <ThemedText style={styles.label}>{t("admin.menus.item.photoLabel")}</ThemedText>
        <View style={styles.photoRow}>
          {item.imageUrl ? <MenuPhoto uri={item.imageUrl} size={PHOTO_PREVIEW_SIZE} /> : null}
          <View style={styles.photoActions}>
            <ButtonRow align="start">
              <Button
                size="md"
                variant="secondary"
                icon="image-outline"
                loading={photoBusy}
                onPress={uploadPhoto}
                testID="item-photo-upload"
              >
                {item.imageUrl
                  ? t("admin.menus.item.photoReplace")
                  : t("admin.menus.item.photoAdd")}
              </Button>
              {item.imageUrl ? (
                <Button
                  size="md"
                  variant="secondary"
                  tone="danger"
                  disabled={photoBusy}
                  onPress={removePhoto}
                  testID="item-photo-remove"
                >
                  {t("admin.menus.item.photoRemove")}
                </Button>
              ) : null}
            </ButtonRow>
            <ThemedText style={[styles.hint, { color: colors.muted }]}>
              {t("admin.menus.item.photoHint")}
            </ThemedText>
            {photoError && (
              <ThemedText style={[styles.error, { color: colors.error }]} role="alert">
                {photoError}
              </ThemedText>
            )}
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <SaveStatus
          status={status}
          error={error}
          onRetry={retry}
          onUndo={undo}
          mutedColor={colors.muted}
          blockedReason={blockedReason}
          testID="item-save-status"
        />
        <Button
          size="md"
          variant="secondary"
          tone="danger"
          onPress={() => setConfirmingDelete(true)}
          testID="item-delete"
        >
          {t("admin.menus.item.delete")}
        </Button>
      </View>
      {deleteError && (
        <ThemedText style={[styles.error, { color: colors.error }]} role="alert">
          {deleteError}
        </ThemedText>
      )}

      <ConfirmModal
        visible={confirmingDelete}
        destructive
        loading={deleting}
        title={t("admin.menus.item.deleteTitle")}
        message={t("admin.menus.item.deleteMessage", { name: item.name })}
        confirmLabel={t("admin.menus.item.delete")}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </View>
  );
}
