import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import { Icon } from "@/components/common/Icon";
import Input from "@/components/common/Input";
import { MenuPhoto } from "@/components/menu/MenuPhoto";
import { SiteThemePicker } from "@/components/admin/site/SiteThemePicker";
import { Banner, Field } from "@/components/onboarding/formParts";
import { StepShell } from "@/components/onboarding/StepShell";
import { deleteLogo, saveBranding, skipStep, uploadLogo } from "@/api/onboarding";
import { useOnboardingCall } from "@/hooks/use-onboarding-call";
import { useAppTheme } from "@/hooks/use-app-theme";
import { COLOR_PRESETS, MAX_TAGLINE_LENGTH } from "@/constants/onboarding";
import type { SiteTheme } from "@/constants/site";
import { isHexColor, isValidBrandColor } from "@/utils/onboardingBranding";
import { pickSiteImage, siteImageRefusalMessage } from "@/utils/siteImage";
import { stepOf } from "@/utils/onboardingStages";
import type { StepProps } from "@/types/onboarding";
import { styles, SWATCH_SIZE } from "./BrandingStep.styles";

const LOGO_THUMBNAIL_SIZE = 96;

const FIELD_OF_CODE: Record<string, "color" | "tagline" | undefined> = {
  "site.color_invalid": "color",
  "site.tagline_too_long": "tagline",
};

/**
 * Step 5: logo, look, colour and tagline. The logo is a press with an immediate effect; the
 * rest is sent with Continue. The colour is `#rrggbb` or nothing, and nothing means the
 * platform's own colour. A colour that is not one is refused on the press with nothing sent. The
 * step is optional, so it can also be skipped.
 *
 * @see [BrandingStep.test.tsx](../../../tests/components/onboarding/steps/BrandingStep.test.tsx)
 * — pins the logo upload and removal, a refused file never reaching the server, a valid and an
 * invalid colour, an empty colour clearing it, and skip.
 */
export function BrandingStep({
  restaurantId,
  state,
  readOnly,
  onState,
  onAdvance,
  onBack,
  onExpired,
}: StepProps) {
  const { t } = useTranslation();
  const { colors, primaryColor } = useAppTheme();
  const [theme, setTheme] = useState<SiteTheme>(state.branding.theme);
  const [color, setColor] = useState(state.branding.primaryColor ?? "");
  const [tagline, setTagline] = useState(state.branding.tagline ?? "");
  const [colorInvalid, setColorInvalid] = useState(false);
  const [logoRefusal, setLogoRefusal] = useState<string | null>(null);
  const form = useOnboardingCall(onExpired);
  const logo = useOnboardingCall(onExpired);

  const canSkip = stepOf(state, "branding")?.canSkip === true;
  const serverField = form.error?.code ? FIELD_OF_CODE[form.error.code] : undefined;
  const serverMessage = (field: "color" | "tagline") =>
    serverField === field ? form.error?.message : undefined;
  const pickerColor = isHexColor(color) ? color : primaryColor;
  const logoUrl = state.branding.logoUrl;
  const colorError = colorInvalid ? t("errors.site.color_invalid") : serverMessage("color");

  const submit = async () => {
    if (!isValidBrandColor(color)) {
      form.clear();
      setColorInvalid(true);
      return;
    }
    setColorInvalid(false);
    const saved = await form.run(() =>
      saveBranding(restaurantId, { theme, primaryColor: color, tagline: tagline.trim() })
    );
    if (saved) {
      onState(saved);
      onAdvance();
    }
  };

  const skip = async () => {
    const saved = await form.run(() => skipStep(restaurantId, "branding"));
    if (saved) {
      onState(saved);
      onAdvance();
    }
  };

  const chooseLogo = async () => {
    const picked = await pickSiteImage();
    if (!picked) return;
    if (picked.refusal) {
      logo.clear();
      setLogoRefusal(siteImageRefusalMessage(picked.refusal, t));
      return;
    }
    setLogoRefusal(null);
    const saved = await logo.run(() => uploadLogo(restaurantId, picked.file));
    if (saved) onState(saved);
  };

  const removeLogo = async () => {
    setLogoRefusal(null);
    const saved = await logo.run(() => deleteLogo(restaurantId));
    if (saved) onState(saved);
  };

  const logoProblem = logoRefusal ?? logo.error?.message ?? null;

  return (
    <StepShell
      testID="step-branding"
      title={t("admin.onboarding.branding.title")}
      description={t("admin.onboarding.branding.description")}
      readOnly={readOnly}
      busy={form.busy}
      primaryDisabled={logo.busy}
      onPrimary={submit}
      onNext={onAdvance}
      onBack={onBack}
      onSkip={canSkip ? skip : undefined}
    >
      {form.error && !serverField ? (
        <Banner testID="step-branding-banner">{form.error.message}</Banner>
      ) : null}

      <Field
        label={t("admin.onboarding.branding.logoLabel")}
        hint={t("admin.onboarding.branding.logoHint")}
        error={logoProblem}
        testID="branding-logo"
      >
        <View style={styles.logo}>
          {logoUrl ? <MenuPhoto uri={logoUrl} size={LOGO_THUMBNAIL_SIZE} /> : null}
          <ButtonRow align="start">
            <Button
              size="md"
              variant="secondary"
              icon="image-outline"
              loading={logo.busy}
              disabled={readOnly}
              onPress={chooseLogo}
              testID="branding-logo-upload"
            >
              {logoUrl
                ? t("admin.onboarding.branding.logoReplace")
                : t("admin.onboarding.branding.logoAdd")}
            </Button>
            {logoUrl ? (
              <Button
                size="md"
                variant="secondary"
                tone="danger"
                icon="trash-outline"
                disabled={readOnly || logo.busy}
                onPress={removeLogo}
                testID="branding-logo-remove"
              >
                {t("admin.onboarding.branding.logoRemove")}
              </Button>
            ) : null}
          </ButtonRow>
        </View>
      </Field>

      <Field label={t("admin.onboarding.branding.themeLabel")} testID="branding-theme">
        <SiteThemePicker value={theme} brandColor={pickerColor} onChange={setTheme} />
      </Field>

      <Field
        label={t("admin.onboarding.branding.colorLabel")}
        hint={t("admin.onboarding.branding.colorHint")}
        error={colorError}
        testID="branding-color"
      >
        <View style={styles.swatches} accessibilityRole="radiogroup">
          {COLOR_PRESETS.map((preset) => {
            const selected = color.toLowerCase() === preset;
            return (
              <Pressable
                key={preset}
                onPress={() => {
                  setColor(preset);
                  setColorInvalid(false);
                }}
                accessibilityRole="radio"
                accessibilityLabel={preset}
                accessibilityState={{ checked: selected }}
                style={[
                  styles.swatch,
                  { backgroundColor: preset, borderColor: selected ? colors.text : "transparent" },
                ]}
                testID={`branding-swatch-${preset}`}
              >
                {selected ? <Icon name="checkmark" size={SWATCH_SIZE / 2} color="#fff" /> : null}
              </Pressable>
            );
          })}
        </View>
        <Input
          style={styles.hex}
          value={color}
          onChangeText={(next) => {
            setColor(next.trim());
            setColorInvalid(false);
          }}
          editable={!readOnly}
          maxLength={7}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={t("admin.onboarding.branding.colorPlaceholder")}
          accessibilityLabel={t("admin.onboarding.branding.colorLabel")}
          testID="branding-color-input"
        />
        {color !== "" ? (
          <ButtonRow align="start">
            <Button
              size="sm"
              variant="ghost"
              tone="neutral"
              onPress={() => {
                setColor("");
                setColorInvalid(false);
              }}
              testID="branding-color-clear"
            >
              {t("admin.onboarding.branding.colorClear")}
            </Button>
          </ButtonRow>
        ) : null}
      </Field>

      <Field
        label={t("admin.onboarding.branding.taglineLabel")}
        hint={t("admin.onboarding.branding.taglineHint")}
        error={serverMessage("tagline")}
        testID="branding-tagline"
      >
        <Input
          value={tagline}
          onChangeText={setTagline}
          editable={!readOnly}
          maxLength={MAX_TAGLINE_LENGTH}
          accessibilityLabel={t("admin.onboarding.branding.taglineLabel")}
          testID="branding-tagline-input"
        />
      </Field>

      <ThemedText style={[styles.note, { color: colors.muted }]}>
        {t("admin.onboarding.branding.note")}
      </ThemedText>
    </StepShell>
  );
}
