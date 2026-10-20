import { useState } from "react";
import { View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Input from "@/components/common/Input";
import { RowTextButton } from "@/components/common/RowTextButton";
import { SaveStatus } from "@/components/admin/settings/SaveStatus";
import { SiteCard } from "@/components/admin/site/SiteCard";
import { fieldStyles } from "@/components/admin/site/SiteCard.styles";
import { SiteSocialLinks } from "@/components/admin/site/SiteSocialLinks";
import { SiteThemePicker } from "@/components/admin/site/SiteThemePicker";
import { adminSaveSite, type SaveSiteInput, type SiteDto } from "@/api/site";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useAutosave } from "@/hooks/use-autosave";
import {
  MAX_COMPANY_NUMBER_LENGTH,
  MAX_LEGAL_ADDRESS_LENGTH,
  MAX_LEGAL_NAME_LENGTH,
  MAX_TAGLINE_LENGTH,
  MAX_VAT_NUMBER_LENGTH,
  PUBLIC_PATH_PREFIX,
  type SiteTheme,
} from "@/constants/site";
import {
  formFromInput,
  formFromSite,
  inputFromForm,
  inputFromSite,
  siteFormProblem,
  type SiteForm,
  type SiteFormProblem,
} from "@/utils/siteForm";
import { SLUG_MAX_LENGTH, typedSlug } from "@/utils/siteSlug";
import { styles } from "./SiteSettingsCard.styles";

const BRAND_SETTINGS_PATH = "/admin/settings/brand" as Href;

/**
 * Everything about a site that is text: theme, tagline, address, social links and the legal
 * notice. One form, one autosave: the server replaces the lot on every save, so sending the
 * fields together is what keeps a half-typed link from overwriting a legal name saved a second
 * earlier. A form the server would refuse is held back and says why, instead of looking broken.
 *
 * @see [SiteSettingsCard.test.tsx](../../../tests/components/admin/site/SiteSettingsCard.test.tsx)
 * — pins the autosave of each field, every withheld-save reason, the undo, and the theme
 * announced to the preview.
 */
export function SiteSettingsCard({
  restaurantId,
  site,
  onSite,
  onThemeChange,
}: {
  restaurantId: number;
  site: SiteDto;
  onSite: (site: SiteDto) => void;
  onThemeChange: (theme: SiteTheme) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, primaryColor } = useAppTheme();

  const [form, setForm] = useState<SiteForm>(() => formFromSite(site));
  const change = (patch: Partial<SiteForm>) => setForm((current) => ({ ...current, ...patch }));

  const problem = siteFormProblem(form, site.isPublished);

  const { status, error, retry, undo } = useAutosave<SaveSiteInput>({
    values: inputFromForm(form),
    saved: inputFromSite(site),
    canSave: problem === null,
    save: async (payload) => {
      const result = await adminSaveSite(restaurantId, payload);
      if (!result.ok) return result.message;
      onSite(result.value);
      return null;
    },
    onRestore: (previous) => {
      setForm(formFromInput(previous));
      onThemeChange(previous.theme);
    },
  });

  const reasons: Record<SiteFormProblem, string> = {
    slug: t("admin.site.settings.problem.slug"),
    socialUrl: t("admin.site.settings.problem.socialUrl"),
    socialDuplicate: t("admin.site.settings.problem.socialDuplicate"),
    identifier: t("admin.site.settings.problem.identifier"),
    legalRequired: t("admin.site.settings.problem.legalRequired"),
  };

  return (
    <View style={styles.stack}>
      <SaveStatus
        status={status}
        error={error}
        onRetry={retry}
        onUndo={undo}
        mutedColor={colors.muted}
        blockedReason={problem ? reasons[problem] : null}
        testID="site-save-status"
      />

      <SiteCard
        title={t("admin.site.settings.appearance.title")}
        description={t("admin.site.settings.appearance.description")}
      >
        <SiteThemePicker
          value={form.theme}
          brandColor={site.brandColor}
          onChange={(theme) => {
            change({ theme });
            onThemeChange(theme);
          }}
        />
        <View style={styles.brandLine}>
          <View
            style={[styles.dot, { backgroundColor: site.brandColor, borderColor: colors.border }]}
          />
          <ThemedText style={[styles.brandText, { color: colors.muted }]}>
            {t("admin.site.settings.brandColor", { color: site.brandColor })}
          </ThemedText>
          <RowTextButton
            label={t("admin.site.settings.changeBrandColor")}
            color={primaryColor}
            icon="color-palette-outline"
            onPress={() => router.push(BRAND_SETTINGS_PATH)}
            testID="site-brand-link"
          />
        </View>
      </SiteCard>

      <SiteCard
        title={t("admin.site.settings.content.title")}
        description={t("admin.site.settings.content.description")}
      >
        <View style={fieldStyles.field}>
          <ThemedText style={fieldStyles.label}>{t("admin.site.settings.taglineLabel")}</ThemedText>
          <Input
            value={form.tagline}
            onChangeText={(tagline) => change({ tagline })}
            maxLength={MAX_TAGLINE_LENGTH}
            placeholder={t("admin.site.settings.taglinePlaceholder")}
            accessibilityLabel={t("admin.site.settings.taglineLabel")}
            testID="site-tagline"
          />
          <ThemedText
            style={[fieldStyles.hint, { color: colors.muted }]}
            testID="site-tagline-count"
          >
            {t("admin.site.settings.taglineCount", {
              count: form.tagline.length,
              max: MAX_TAGLINE_LENGTH,
            })}
          </ThemedText>
        </View>

        <View style={fieldStyles.field}>
          <ThemedText style={fieldStyles.label}>{t("admin.site.settings.addressLabel")}</ThemedText>
          <View style={styles.addressLine}>
            <ThemedText style={[styles.prefix, { color: colors.muted }]}>
              {PUBLIC_PATH_PREFIX}
            </ThemedText>
            <View style={styles.addressInput}>
              <Input
                value={form.slug}
                onChangeText={(text) => change({ slug: typedSlug(text) })}
                maxLength={SLUG_MAX_LENGTH}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel={t("admin.site.settings.addressLabel")}
                testID="site-slug"
              />
            </View>
          </View>
          <ThemedText style={[fieldStyles.hint, { color: colors.muted }]}>
            {t("admin.site.settings.addressHint")}
          </ThemedText>
        </View>
      </SiteCard>

      <SiteCard
        title={t("admin.site.settings.social.title")}
        description={t("admin.site.settings.social.description")}
      >
        <SiteSocialLinks rows={form.socials} onChange={(socials) => change({ socials })} />
      </SiteCard>

      <SiteCard
        title={t("admin.site.settings.legal.title")}
        description={t("admin.site.settings.legal.description")}
      >
        <View style={fieldStyles.field}>
          <ThemedText style={fieldStyles.label}>
            {t("admin.site.settings.legal.nameLabel")}
          </ThemedText>
          <Input
            value={form.legalName}
            onChangeText={(legalName) => change({ legalName })}
            maxLength={MAX_LEGAL_NAME_LENGTH}
            accessibilityLabel={t("admin.site.settings.legal.nameLabel")}
            testID="site-legal-name"
          />
        </View>
        <View style={fieldStyles.field}>
          <ThemedText style={fieldStyles.label}>
            {t("admin.site.settings.legal.companyNumberLabel")}
          </ThemedText>
          <Input
            value={form.companyNumber}
            onChangeText={(companyNumber) => change({ companyNumber })}
            maxLength={MAX_COMPANY_NUMBER_LENGTH}
            placeholder="0123.456.789"
            accessibilityLabel={t("admin.site.settings.legal.companyNumberLabel")}
            testID="site-company-number"
          />
        </View>
        <View style={fieldStyles.field}>
          <ThemedText style={fieldStyles.label}>
            {t("admin.site.settings.legal.vatNumberLabel")}
          </ThemedText>
          <Input
            value={form.vatNumber}
            onChangeText={(vatNumber) => change({ vatNumber })}
            maxLength={MAX_VAT_NUMBER_LENGTH}
            placeholder="BE 0123.456.789"
            accessibilityLabel={t("admin.site.settings.legal.vatNumberLabel")}
            testID="site-vat-number"
          />
        </View>
        <View style={fieldStyles.field}>
          <ThemedText style={fieldStyles.label}>
            {t("admin.site.settings.legal.addressLabel")}
          </ThemedText>
          <Input
            value={form.legalAddress}
            onChangeText={(legalAddress) => change({ legalAddress })}
            maxLength={MAX_LEGAL_ADDRESS_LENGTH}
            accessibilityLabel={t("admin.site.settings.legal.addressLabel")}
            testID="site-legal-address"
          />
          <ThemedText style={[fieldStyles.hint, { color: colors.muted }]}>
            {t("admin.site.settings.legal.addressHint")}
          </ThemedText>
        </View>
      </SiteCard>
    </View>
  );
}
