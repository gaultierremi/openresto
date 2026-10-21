import { useEffect, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import { ConsentCheckbox } from "@/components/onboarding/ConsentCheckbox";
import { Banner, Field } from "@/components/onboarding/formParts";
import { MessageCard } from "@/components/onboarding/MessageCard";
import { OnboardingPage } from "@/components/onboarding/OnboardingPage";
import { acceptInvitation, getInvitation, type InvitationPreview } from "@/api/onboarding";
import { useOnboardingSession } from "@/context/OnboardingSessionContext";
import { useAppTheme } from "@/hooks/use-app-theme";
import {
  LEGAL_DOCUMENT_KEYS,
  MAX_DISPLAY_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
  legalPath,
  type LegalDocumentKey,
} from "@/constants/onboarding";
import { canAcceptInvitation, passwordProblem } from "@/utils/onboardingInvitation";
import { openExternal } from "@/utils/openExternal";
import { styles } from "@/styles/onboarding/invitation.styles";

type Load =
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "error"; message: string }
  | { status: "ready"; preview: InvitationPreview };

const isKnownDocument = (key: string): key is LegalDocumentKey =>
  (LEGAL_DOCUMENT_KEYS as readonly string[]).includes(key);

/**
 * What the invitation link opens: the restaurant and the address the account will use, both
 * read-only, then the account itself. Nothing is created until the password passes and every
 * document the server named is ticked, one box each; what is sent back is exactly the key and
 * version pairs the preview carried, so a document that changed in between is the server's to
 * refuse, and the preview is then loaded again with every box cleared. A link that is invalid,
 * expired or already used shows no form at all, and nothing says which of the three it was.
 *
 * @see [InvitationScreen.test.tsx](../../tests/components/onboarding/InvitationScreen.test.tsx)
 * — pins the button waiting on all three consents and on a ten-character matching password, the
 * pairs sent, the landing on the restaurant, the invalid screen holding no form, and the
 * outdated-consent and short-password refusals.
 */
export function InvitationScreen({ token }: { token: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { refresh } = useOnboardingSession();
  const { colors } = useAppTheme();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [reveal, setReveal] = useState(false);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getInvitation(token).then((result) => {
      if (cancelled) return;
      if (result.ok) setLoad({ status: "ready", preview: result.value });
      else if (result.status === 404) setLoad({ status: "invalid" });
      else setLoad({ status: "error", message: result.message });
    });
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  if (load.status === "loading") {
    return (
      <OnboardingPage centered>
        <ThemedText testID="invitation-loading">
          {t("admin.onboarding.invitation.loading")}
        </ThemedText>
      </OnboardingPage>
    );
  }

  if (load.status === "invalid") {
    return (
      <OnboardingPage centered>
        <MessageCard
          icon="mail-unread-outline"
          title={t("admin.onboarding.invitation.invalidTitle")}
          body={t("admin.onboarding.invitation.invalidBody")}
          testID="invitation-invalid"
        >
          <Button
            size="md"
            variant="secondary"
            onPress={() => router.replace("/onboarding/login")}
            testID="invitation-invalid-login"
          >
            {t("admin.onboarding.invitation.invalidAction")}
          </Button>
        </MessageCard>
      </OnboardingPage>
    );
  }

  if (load.status === "error") {
    return (
      <OnboardingPage centered>
        <MessageCard
          icon="cloud-offline-outline"
          title={t("admin.onboarding.invitation.errorTitle")}
          body={load.message}
          testID="invitation-error"
        >
          <Button
            size="md"
            variant="secondary"
            onPress={() => {
              setLoad({ status: "loading" });
              setAttempt((n) => n + 1);
            }}
            testID="invitation-retry"
          >
            {t("common.actions.tryAgain")}
          </Button>
        </MessageCard>
      </OnboardingPage>
    );
  }

  const { preview } = load;
  const problem = passwordProblem(password, confirmation);
  const canSubmit = canAcceptInvitation(password, confirmation, preview.documents, accepted);

  const documentName = (key: string) =>
    isKnownDocument(key) ? t(`admin.onboarding.invitation.documents.${key}.name`) : key;

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const result = await acceptInvitation(token, {
      password,
      displayName: displayName.trim() === "" ? null : displayName.trim(),
      acceptedDocuments: preview.documents.map(({ key, version }) => ({ key, version })),
    });
    if (result.ok) {
      // The server set the cookie; the layout still holds the answer it got before it, and
      // would send the new account straight back to sign in.
      await refresh();
      router.replace(`/onboarding/restaurant/${result.value.restaurantId}`);
      return;
    }
    setSubmitting(false);
    if (result.status === 404) {
      setLoad({ status: "invalid" });
      return;
    }
    if (result.code === "onboarding.consent_outdated") {
      setAccepted({});
      const fresh = await getInvitation(token);
      if (fresh.ok) setLoad({ status: "ready", preview: fresh.value });
    }
    setError(result.message);
  };

  return (
    <OnboardingPage centered>
      <ThemedView
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      >
        <View>
          <ThemedText style={styles.title} role="heading">
            {t("admin.onboarding.invitation.title")}
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: colors.muted }]}>
            {t("admin.onboarding.invitation.subtitle")}
          </ThemedText>
        </View>

        <Field
          label={t("admin.onboarding.invitation.restaurantLabel")}
          testID="invitation-restaurant"
        >
          <View
            style={[styles.readOnly, { borderColor: colors.border, backgroundColor: colors.input }]}
          >
            <ThemedText style={styles.readOnlyText}>{preview.restaurantName}</ThemedText>
          </View>
        </Field>
        <Field
          label={t("admin.onboarding.invitation.emailLabel")}
          hint={t("admin.onboarding.invitation.emailHint")}
          testID="invitation-email"
        >
          <View
            style={[styles.readOnly, { borderColor: colors.border, backgroundColor: colors.input }]}
          >
            <ThemedText style={styles.readOnlyText}>{preview.email}</ThemedText>
          </View>
        </Field>

        <Field label={t("admin.onboarding.invitation.displayNameLabel")} testID="invitation-name">
          <Input
            value={displayName}
            onChangeText={setDisplayName}
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            autoComplete="name"
            placeholder={t("admin.onboarding.invitation.displayNamePlaceholder")}
            accessibilityLabel={t("admin.onboarding.invitation.displayNameLabel")}
            testID="invitation-display-name"
          />
        </Field>

        <Field
          label={t("admin.onboarding.invitation.passwordLabel")}
          testID="invitation-password-field"
        >
          <View style={styles.passwordRow}>
            <View style={styles.passwordInput}>
              <Input
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!reveal}
                autoComplete="new-password"
                accessibilityLabel={t("admin.onboarding.invitation.passwordLabel")}
                testID="invitation-password"
              />
            </View>
            <Button
              variant="ghost"
              tone="neutral"
              size="sm"
              onPress={() => setReveal((shown) => !shown)}
              accessibilityLabel={
                reveal
                  ? t("admin.onboarding.invitation.hidePassword")
                  : t("admin.onboarding.invitation.showPassword")
              }
              testID="invitation-reveal"
            >
              {reveal
                ? t("admin.onboarding.invitation.hide")
                : t("admin.onboarding.invitation.show")}
            </Button>
          </View>
          <ThemedText
            style={[
              styles.rule,
              { color: password !== "" && problem === "tooShort" ? colors.error : colors.muted },
            ]}
            testID="invitation-rule"
          >
            {t("admin.onboarding.invitation.passwordRule", { min: MIN_PASSWORD_LENGTH })}
          </ThemedText>
        </Field>

        <Field
          label={t("admin.onboarding.invitation.confirmLabel")}
          error={
            confirmation !== "" && password !== confirmation
              ? t("admin.onboarding.invitation.mismatch")
              : null
          }
          testID="invitation-confirm-field"
        >
          <Input
            value={confirmation}
            onChangeText={setConfirmation}
            secureTextEntry={!reveal}
            autoComplete="new-password"
            accessibilityLabel={t("admin.onboarding.invitation.confirmLabel")}
            testID="invitation-confirm"
          />
        </Field>

        <View style={styles.consents}>
          <ThemedText style={styles.consentsTitle}>
            {t("admin.onboarding.invitation.consentsTitle")}
          </ThemedText>
          {preview.documents.map((document) => (
            <ConsentCheckbox
              key={document.key}
              checked={accepted[document.key] === true}
              onChange={(checked) =>
                setAccepted((current) => ({ ...current, [document.key]: checked }))
              }
              label={t("admin.onboarding.invitation.consent", {
                document: documentName(document.key),
              })}
              linkLabel={t("admin.onboarding.invitation.readDocument", {
                document: documentName(document.key),
              })}
              onOpen={() => openExternal(legalPath(document.key))}
              testID={`invitation-consent-${document.key}`}
            />
          ))}
        </View>

        {error ? <Banner testID="invitation-error-banner">{error}</Banner> : null}

        <Button
          fullWidth
          loading={submitting}
          disabled={!canSubmit}
          onPress={submit}
          testID="invitation-submit"
        >
          {t("admin.onboarding.invitation.submit")}
        </Button>
      </ThemedView>
    </OnboardingPage>
  );
}
