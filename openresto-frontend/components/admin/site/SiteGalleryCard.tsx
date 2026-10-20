import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import ConfirmModal from "@/components/common/ConfirmModal";
import Input from "@/components/common/Input";
import { RowTextButton } from "@/components/common/RowTextButton";
import { MoveButtons } from "@/components/admin/menus/MoveButtons";
import { SaveStatus } from "@/components/admin/settings/SaveStatus";
import { SiteCard } from "@/components/admin/site/SiteCard";
import { MenuPhoto } from "@/components/menu/MenuPhoto";
import {
  adminAddSitePhoto,
  adminDeleteSitePhoto,
  adminReorderSitePhotos,
  adminUpdateSitePhotoAlt,
  type SiteDto,
  type SitePhoto,
} from "@/api/site";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useAutosave } from "@/hooks/use-autosave";
import { MAX_ALT_LENGTH, MAX_PHOTOS, RECOMMENDED_MIN_PHOTOS } from "@/constants/site";
import { pickSiteImage, siteImageRefusalMessage } from "@/utils/siteImage";
import { moveId } from "@/utils/reorder";
import { styles } from "./SiteGalleryCard.styles";

const THUMBNAIL_SIZE = 72;

function PhotoRow({
  restaurantId,
  photo,
  isFirst,
  isLast,
  reorderBusy,
  onMove,
  onSite,
}: {
  restaurantId: number;
  photo: SitePhoto;
  isFirst: boolean;
  isLast: boolean;
  reorderBusy: boolean;
  onMove: (direction: -1 | 1) => void;
  onSite: (site: SiteDto) => void;
}) {
  const { t } = useTranslation();
  const { colors, primaryColor } = useAppTheme();
  const [alt, setAlt] = useState(photo.alt);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const { status, error, retry, undo } = useAutosave<{ alt: string }>({
    values: { alt: alt.trim() },
    saved: { alt: photo.alt },
    canSave: alt.trim().length > 0,
    save: async (payload) => {
      const result = await adminUpdateSitePhotoAlt(restaurantId, photo.id, payload.alt);
      if (!result.ok) return result.message;
      onSite(result.value);
      return null;
    },
    onRestore: (previous) => setAlt(previous.alt),
  });

  const confirmDelete = async () => {
    setDeleting(true);
    setProblem(null);
    const result = await adminDeleteSitePhoto(restaurantId, photo.id);
    setDeleting(false);
    if (result.ok) return onSite(result.value);
    setConfirming(false);
    setProblem(result.message);
  };

  return (
    <View style={[styles.photo, { borderColor: colors.border }]} testID={`site-photo-${photo.id}`}>
      <MenuPhoto uri={photo.url} size={THUMBNAIL_SIZE} />
      <View style={styles.fields}>
        <ThemedText style={styles.label}>{t("admin.site.gallery.altLabel")}</ThemedText>
        <Input
          value={alt}
          onChangeText={setAlt}
          maxLength={MAX_ALT_LENGTH}
          accessibilityLabel={t("admin.site.gallery.altLabel")}
          testID={`site-photo-alt-${photo.id}`}
        />
        <SaveStatus
          status={status}
          error={error}
          onRetry={retry}
          onUndo={undo}
          mutedColor={colors.muted}
          blockedReason={alt.trim() ? null : t("admin.site.gallery.altRequired")}
          testID={`site-photo-status-${photo.id}`}
        />
        {problem && (
          <ThemedText style={[styles.error, { color: colors.error }]} role="alert">
            {problem}
          </ThemedText>
        )}
      </View>
      <View style={styles.actions}>
        <MoveButtons
          name={photo.alt}
          isFirst={isFirst}
          isLast={isLast}
          busy={reorderBusy}
          onMove={onMove}
          testIDPrefix={`site-photo-${photo.id}`}
        />
        <RowTextButton
          label={t("admin.site.gallery.remove")}
          accessibilityLabel={t("admin.site.gallery.removeNamed", { name: photo.alt })}
          color={primaryColor}
          icon="trash-outline"
          onPress={() => setConfirming(true)}
          testID={`site-photo-remove-${photo.id}`}
        />
      </View>
      <ConfirmModal
        visible={confirming}
        destructive
        loading={deleting}
        title={t("admin.site.gallery.removeTitle")}
        message={t("admin.site.gallery.removeMessage", { name: photo.alt })}
        confirmLabel={t("admin.site.gallery.remove")}
        onConfirm={confirmDelete}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}

/**
 * The gallery: up to {@link MAX_PHOTOS} photos, each with the text description a screen reader
 * says in its place. The description is asked for before the file, because an upload without
 * one would be refused after the transfer. The add form disappears at the cap rather than
 * failing at the seventh.
 *
 * @see [SiteGalleryCard.test.tsx](../../../tests/components/admin/site/SiteGalleryCard.test.tsx)
 * — pins the sixth photo being offered and the seventh not, the required description, the
 * autosaved description, the reorder and the confirmed removal.
 */
export function SiteGalleryCard({
  restaurantId,
  site,
  onSite,
}: {
  restaurantId: number;
  site: SiteDto;
  onSite: (site: SiteDto) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [adding, setAdding] = useState(false);
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false);
  const [reorderBusy, setReorderBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const { photos } = site;
  const full = photos.length >= MAX_PHOTOS;

  const closeForm = () => {
    setAdding(false);
    setAlt("");
  };

  const chooseFile = async () => {
    const picked = await pickSiteImage();
    if (!picked) return;
    if (picked.refusal) return setProblem(siteImageRefusalMessage(picked.refusal, t));
    setBusy(true);
    setProblem(null);
    const result = await adminAddSitePhoto(restaurantId, picked.file, alt.trim());
    setBusy(false);
    if (!result.ok) return setProblem(result.message);
    onSite(result.value);
    closeForm();
  };

  const move = async (index: number, direction: -1 | 1) => {
    const after = moveId(
      photos.map((photo) => photo.id),
      index,
      direction
    );
    if (!after) return;
    setReorderBusy(true);
    setProblem(null);
    const result = await adminReorderSitePhotos(restaurantId, after);
    setReorderBusy(false);
    if (result.ok) onSite(result.value);
    else setProblem(result.message);
  };

  return (
    <SiteCard
      title={t("admin.site.gallery.title")}
      description={t("admin.site.gallery.description")}
      testID="site-gallery"
    >
      <ThemedText style={[styles.count, { color: colors.muted }]} testID="site-gallery-count">
        {t("admin.site.gallery.count", {
          count: photos.length,
          min: RECOMMENDED_MIN_PHOTOS,
          max: MAX_PHOTOS,
        })}
      </ThemedText>

      <View style={styles.list}>
        {photos.map((photo, index) => (
          <PhotoRow
            key={photo.id}
            restaurantId={restaurantId}
            photo={photo}
            isFirst={index === 0}
            isLast={index === photos.length - 1}
            reorderBusy={reorderBusy}
            onMove={(direction) => move(index, direction)}
            onSite={onSite}
          />
        ))}
      </View>

      {problem && (
        <ThemedText style={[styles.error, { color: colors.error }]} role="alert">
          {problem}
        </ThemedText>
      )}

      {full ? (
        <ThemedText style={[styles.hint, { color: colors.muted }]} testID="site-gallery-full">
          {t("admin.site.gallery.full", { max: MAX_PHOTOS })}
        </ThemedText>
      ) : adding ? (
        <View style={styles.addForm}>
          <ThemedText style={styles.label}>{t("admin.site.gallery.newAltLabel")}</ThemedText>
          <Input
            value={alt}
            onChangeText={setAlt}
            maxLength={MAX_ALT_LENGTH}
            placeholder={t("admin.site.gallery.newAltPlaceholder")}
            accessibilityLabel={t("admin.site.gallery.newAltLabel")}
            autoFocus
            testID="site-photo-new-alt"
          />
          <ThemedText style={[styles.hint, { color: colors.muted }]}>
            {t("admin.site.gallery.newAltHint")}
          </ThemedText>
          <ButtonRow>
            <Button size="md" variant="secondary" tone="neutral" onPress={closeForm}>
              {t("common.actions.cancel")}
            </Button>
            <Button
              size="md"
              icon="image-outline"
              loading={busy}
              disabled={!alt.trim()}
              onPress={chooseFile}
              testID="site-photo-choose"
            >
              {t("admin.site.gallery.choose")}
            </Button>
          </ButtonRow>
        </View>
      ) : (
        <ButtonRow align="start">
          <Button size="md" icon="add" onPress={() => setAdding(true)} testID="site-photo-add">
            {t("admin.site.gallery.add")}
          </Button>
        </ButtonRow>
      )}
    </SiteCard>
  );
}
