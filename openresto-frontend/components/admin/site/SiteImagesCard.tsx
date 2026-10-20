import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import { MenuPhoto } from "@/components/menu/MenuPhoto";
import { SiteCard } from "@/components/admin/site/SiteCard";
import {
  adminDeleteSiteImage,
  adminUploadSiteImage,
  type SiteDto,
  type SiteImageSlot,
} from "@/api/site";
import { useAppTheme } from "@/hooks/use-app-theme";
import { pickSiteImage, siteImageRefusalMessage } from "@/utils/siteImage";
import { styles } from "./SiteImagesCard.styles";

const THUMBNAIL_SIZE = 96;

function ImageSlot({
  restaurantId,
  slot,
  url,
  onSite,
}: {
  restaurantId: number;
  slot: SiteImageSlot;
  url: string | null;
  onSite: (site: SiteDto) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const labels =
    slot === "logo"
      ? {
          title: t("admin.site.images.logo.title"),
          hint: t("admin.site.images.logo.hint"),
          add: t("admin.site.images.logo.add"),
          replace: t("admin.site.images.logo.replace"),
          remove: t("admin.site.images.logo.remove"),
        }
      : {
          title: t("admin.site.images.cover.title"),
          hint: t("admin.site.images.cover.hint"),
          add: t("admin.site.images.cover.add"),
          replace: t("admin.site.images.cover.replace"),
          remove: t("admin.site.images.cover.remove"),
        };

  const run = async (call: () => ReturnType<typeof adminDeleteSiteImage>) => {
    setBusy(true);
    setProblem(null);
    const result = await call();
    setBusy(false);
    if (result.ok) onSite(result.value);
    else setProblem(result.message);
  };

  const choose = async () => {
    const picked = await pickSiteImage();
    if (!picked) return;
    if (picked.refusal) return setProblem(siteImageRefusalMessage(picked.refusal, t));
    await run(() => adminUploadSiteImage(restaurantId, slot, picked.file));
  };

  return (
    <View style={styles.slot} testID={`site-image-${slot}`}>
      <ThemedText style={styles.label}>{labels.title}</ThemedText>
      <ThemedText style={[styles.hint, { color: colors.muted }]}>{labels.hint}</ThemedText>
      <View style={styles.row}>
        {url ? <MenuPhoto uri={url} size={THUMBNAIL_SIZE} /> : null}
        <ButtonRow align="start">
          <Button
            size="md"
            variant="secondary"
            icon="image-outline"
            loading={busy}
            onPress={choose}
            testID={`site-image-${slot}-upload`}
          >
            {url ? labels.replace : labels.add}
          </Button>
          {url ? (
            <Button
              size="md"
              variant="secondary"
              tone="danger"
              icon="trash-outline"
              disabled={busy}
              onPress={() => run(() => adminDeleteSiteImage(restaurantId, slot))}
              testID={`site-image-${slot}-remove`}
            >
              {labels.remove}
            </Button>
          ) : null}
        </ButtonRow>
      </View>
      {problem && (
        <ThemedText style={[styles.error, { color: colors.error }]} role="alert">
          {problem}
        </ThemedText>
      )}
    </View>
  );
}

/**
 * The logo and the cover photo. Uploading, replacing and removing are presses with an immediate
 * effect, not autosaved fields; the server answers each with the whole site, which replaces the
 * screen's copy. The server shrinks and re-encodes whatever is sent, so the only checks made
 * here are the ones that save a pointless upload.
 *
 * @see [SiteImagesCard.test.tsx](../../../tests/components/admin/site/SiteImagesCard.test.tsx)
 * — pins the upload, replace and remove of both slots, and that a refused file never reaches
 * the server.
 */
export function SiteImagesCard({
  restaurantId,
  site,
  onSite,
}: {
  restaurantId: number;
  site: SiteDto;
  onSite: (site: SiteDto) => void;
}) {
  const { t } = useTranslation();
  return (
    <SiteCard
      title={t("admin.site.images.title")}
      description={t("admin.site.images.description")}
      testID="site-images"
    >
      <ImageSlot restaurantId={restaurantId} slot="logo" url={site.logoUrl} onSite={onSite} />
      <ImageSlot restaurantId={restaurantId} slot="cover" url={site.coverUrl} onSite={onSite} />
    </SiteCard>
  );
}
