import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import { Icon } from "@/components/common/Icon";
import { COPY_CONFIRMATION_MS, copyToClipboard } from "@/components/admin/settings/clipboard";
import { SiteCard } from "@/components/admin/site/SiteCard";
import { adminSetSitePublished, type SiteDto } from "@/api/site";
import { useAppTheme } from "@/hooks/use-app-theme";
import type { MissingField } from "@/constants/site";
import { openExternal } from "@/utils/openExternal";
import { theme } from "@/theme/theme";
import { styles } from "./SitePublishCard.styles";

/**
 * Publication: the one step that puts the site in front of the public, so it is a button with a
 * checklist rather than an autosaved switch. The checklist is what the server says is missing;
 * while anything is, the publish button is disabled and the first thing to do is named beside it.
 *
 * @see [SitePublishCard.test.tsx](../../../tests/components/admin/site/SitePublishCard.test.tsx)
 * — pins the button disabled with each item missing and enabled with none, unpublishing, the
 * public link once live, and the copy confirmation.
 */
export function SitePublishCard({
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
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPY_CONFIRMATION_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  const todo: Record<MissingField, string> = {
    "legal.name": t("admin.site.publish.todo.legalName"),
    "legal.companyNumber": t("admin.site.publish.todo.companyNumber"),
    "contact.email": t("admin.site.publish.todo.contactEmail"),
  };

  const publicUrl = `${window.location.origin}${site.publicPath}`;
  const blocked = site.missing.length > 0;

  const toggle = async () => {
    setBusy(true);
    setProblem(null);
    const result = await adminSetSitePublished(restaurantId, !site.isPublished);
    setBusy(false);
    if (result.ok) onSite(result.value);
    else setProblem(result.message);
  };

  const copy = async () => setCopied(await copyToClipboard(publicUrl));

  return (
    <SiteCard
      title={t("admin.site.publish.title")}
      description={t("admin.site.publish.description")}
      testID="site-publish"
    >
      <View style={styles.statusLine}>
        <View
          style={[
            styles.badge,
            { backgroundColor: site.isPublished ? theme.badge.active.bg : colors.surfaceAlt },
          ]}
          testID="site-status"
        >
          <ThemedText
            style={[
              styles.badgeText,
              { color: site.isPublished ? theme.badge.active.text : colors.muted },
            ]}
          >
            {site.isPublished ? t("admin.site.publish.live") : t("admin.site.publish.draft")}
          </ThemedText>
        </View>
        {site.isPublished && (
          <ThemedText style={styles.address} testID="site-public-url">
            {publicUrl}
          </ThemedText>
        )}
      </View>

      {blocked && (
        <View style={styles.checklist} testID="site-checklist">
          <ThemedText style={styles.checkTitle}>
            {t("admin.site.publish.checklistTitle")}
          </ThemedText>
          {site.missing.map((field) => (
            <View key={field} style={styles.checkItem}>
              <Icon name="ellipse-outline" size="sm" color={theme.colors.warning} />
              <ThemedText style={styles.checkText}>{todo[field]}</ThemedText>
            </View>
          ))}
        </View>
      )}

      {problem && (
        <ThemedText style={[styles.error, { color: colors.error }]} role="alert">
          {problem}
        </ThemedText>
      )}

      <ButtonRow align="start">
        {site.isPublished && (
          <>
            <Button
              size="md"
              variant="secondary"
              icon="open-outline"
              onPress={() => openExternal(publicUrl)}
              testID="site-open"
            >
              {t("admin.site.publish.view")}
            </Button>
            <Button
              size="md"
              variant="secondary"
              icon={copied ? "checkmark" : "copy-outline"}
              onPress={copy}
              testID="site-copy"
            >
              {copied ? t("admin.site.publish.copied") : t("admin.site.publish.copy")}
            </Button>
          </>
        )}
        {site.isPublished ? (
          <Button
            size="md"
            variant="secondary"
            tone="neutral"
            loading={busy}
            onPress={toggle}
            testID="site-unpublish"
          >
            {t("admin.site.publish.unpublish")}
          </Button>
        ) : (
          <Button
            size="md"
            icon="globe-outline"
            loading={busy}
            disabled={blocked}
            onPress={toggle}
            testID="site-publish-button"
          >
            {t("admin.site.publish.publish")}
          </Button>
        )}
      </ButtonRow>
      {blocked && !site.isPublished && (
        <ThemedText style={[styles.hint, { color: colors.muted }]}>
          {t("admin.site.publish.blockedHint")}
        </ThemedText>
      )}
    </SiteCard>
  );
}
