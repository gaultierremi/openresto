import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Input from "@/components/common/Input";
import { Banner, Field } from "@/components/onboarding/formParts";
import { StepShell } from "@/components/onboarding/StepShell";
import { saveInfo } from "@/api/onboarding";
import { useOnboardingCall } from "@/hooks/use-onboarding-call";
import {
  MAX_ADDRESS_LENGTH,
  MAX_COMPANY_NUMBER_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_LEGAL_NAME_LENGTH,
  MAX_NAME_LENGTH,
  MAX_PHONE_LENGTH,
  MAX_RETENTION_MONTHS,
  MAX_VAT_LENGTH,
  MIN_RETENTION_MONTHS,
} from "@/constants/onboarding";
import {
  fieldOfCode,
  infoErrors,
  infoFormFromState,
  infoRequest,
  type InfoErrorKey,
  type InfoField,
  type InfoForm,
} from "@/utils/onboardingInfo";
import type { StepProps } from "@/types/onboarding";
import { styles } from "./InfoStep.styles";

/**
 * Step 1: who and where, the company behind it, and how long a guest stays identifiable. What
 * the server would refuse on sight is refused on the press, with nothing sent; what only it can
 * judge (the control digits of the enterprise number) comes back in its own words and lands
 * beside the field its code names, or above the form when the code names none.
 *
 * @see [InfoStep.test.tsx](../../../tests/components/onboarding/steps/InfoStep.test.tsx) — pins
 * that a missing field or a retention of 0 or 61 sends nothing, that 1 and 60 are sent, that a
 * refusal by code lands beside its field and keeps the step, and that read-only takes no input.
 */
export function InfoStep({
  restaurantId,
  state,
  readOnly,
  onState,
  onAdvance,
  onBack,
  onExpired,
}: StepProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<InfoForm>(() => infoFormFromState(state.info));
  const [localErrors, setLocalErrors] = useState<Partial<Record<InfoField, InfoErrorKey>>>({});
  const { busy, error, run, clear } = useOnboardingCall(onExpired);

  const serverField = fieldOfCode(error?.code);

  const edit = (field: InfoField) => (value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setLocalErrors((current) => ({ ...current, [field]: undefined }));
  };

  const errorFor = (field: InfoField): string | null => {
    const key = localErrors[field];
    if (key) {
      return t(key, { min: MIN_RETENTION_MONTHS, max: MAX_RETENTION_MONTHS });
    }
    return serverField === field && error ? error.message : null;
  };

  const submit = async () => {
    const problems = infoErrors(form);
    if (Object.keys(problems).length > 0) {
      clear();
      setLocalErrors(problems);
      return;
    }
    setLocalErrors({});
    const saved = await run(() => saveInfo(restaurantId, infoRequest(form)));
    if (saved) {
      onState(saved);
      onAdvance();
    }
  };

  return (
    <StepShell
      testID="step-info"
      title={t("admin.onboarding.info.title")}
      description={t("admin.onboarding.info.description")}
      readOnly={readOnly}
      busy={busy}
      onPrimary={submit}
      onNext={onAdvance}
      onBack={onBack}
    >
      {error && !serverField ? <Banner testID="step-info-banner">{error.message}</Banner> : null}

      <View style={styles.group}>
        <Field
          label={t("admin.onboarding.info.nameLabel")}
          error={errorFor("name")}
          testID="info-name"
        >
          <Input
            value={form.name}
            onChangeText={edit("name")}
            editable={!readOnly}
            maxLength={MAX_NAME_LENGTH}
            autoComplete="organization"
            accessibilityLabel={t("admin.onboarding.info.nameLabel")}
          />
        </Field>
        <Field
          label={t("admin.onboarding.info.addressLabel")}
          hint={t("admin.onboarding.info.addressHint")}
          error={errorFor("address")}
          testID="info-address"
        >
          <Input
            value={form.address}
            onChangeText={edit("address")}
            editable={!readOnly}
            maxLength={MAX_ADDRESS_LENGTH}
            autoComplete="street-address"
            accessibilityLabel={t("admin.onboarding.info.addressLabel")}
          />
        </Field>
        <Field
          label={t("admin.onboarding.info.phoneLabel")}
          error={errorFor("phone")}
          testID="info-phone"
        >
          <Input
            value={form.phone}
            onChangeText={edit("phone")}
            editable={!readOnly}
            maxLength={MAX_PHONE_LENGTH}
            keyboardType="phone-pad"
            autoComplete="tel"
            accessibilityLabel={t("admin.onboarding.info.phoneLabel")}
          />
        </Field>
        <Field
          label={t("admin.onboarding.info.emailLabel")}
          hint={t("admin.onboarding.info.emailHint")}
          error={errorFor("email")}
          testID="info-email"
        >
          <Input
            value={form.email}
            onChangeText={edit("email")}
            editable={!readOnly}
            maxLength={MAX_EMAIL_LENGTH}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            accessibilityLabel={t("admin.onboarding.info.emailLabel")}
          />
        </Field>
      </View>

      <View style={styles.group}>
        <ThemedText style={styles.groupTitle}>{t("admin.onboarding.info.companyTitle")}</ThemedText>
        <Field
          label={t("admin.onboarding.info.legalNameLabel")}
          hint={t("admin.onboarding.info.legalNameHint")}
          error={errorFor("legalName")}
          testID="info-legalName"
        >
          <Input
            value={form.legalName}
            onChangeText={edit("legalName")}
            editable={!readOnly}
            maxLength={MAX_LEGAL_NAME_LENGTH}
            accessibilityLabel={t("admin.onboarding.info.legalNameLabel")}
          />
        </Field>
        <Field
          label={t("admin.onboarding.info.companyNumberLabel")}
          hint={t("admin.onboarding.info.companyNumberHint")}
          error={errorFor("companyNumber")}
          testID="info-companyNumber"
        >
          <Input
            value={form.companyNumber}
            onChangeText={edit("companyNumber")}
            editable={!readOnly}
            maxLength={MAX_COMPANY_NUMBER_LENGTH}
            autoCapitalize="none"
            accessibilityLabel={t("admin.onboarding.info.companyNumberLabel")}
          />
        </Field>
        <Field
          label={t("admin.onboarding.info.vatLabel")}
          hint={t("admin.onboarding.info.vatHint")}
          error={errorFor("vatNumber")}
          testID="info-vatNumber"
        >
          <Input
            value={form.vatNumber}
            onChangeText={edit("vatNumber")}
            editable={!readOnly}
            maxLength={MAX_VAT_LENGTH}
            autoCapitalize="characters"
            accessibilityLabel={t("admin.onboarding.info.vatLabel")}
          />
        </Field>
      </View>

      <View style={styles.group}>
        <Field
          label={t("admin.onboarding.info.retentionLabel")}
          hint={t("admin.onboarding.info.retentionHint")}
          error={errorFor("retention")}
          testID="info-retention"
        >
          <Input
            style={styles.retention}
            value={form.retention}
            onChangeText={edit("retention")}
            editable={!readOnly}
            maxLength={2}
            keyboardType="number-pad"
            accessibilityLabel={t("admin.onboarding.info.retentionLabel")}
          />
        </Field>
      </View>
    </StepShell>
  );
}
