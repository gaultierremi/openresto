import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import { ModalCard } from "@/components/common/ModalCard";
import { RowTextButton } from "@/components/common/RowTextButton";
import { useAppTheme } from "@/hooks/use-app-theme";
import { theme } from "@/theme/theme";
import { isValidEmail } from "@/utils/validation";
import {
  createPlatformRestaurant,
  sendPlatformInvitation,
  type PlatformRestaurant,
} from "@/api/platform";
import {
  INVITATION_LOCALES,
  MAX_EMAIL_LENGTH,
  MAX_RESTAURANT_NAME_LENGTH,
  type InvitationLocale,
} from "@/constants/platform";
import { InvitationLinkPanel } from "./InvitationLinkPanel";
import { invitationLocaleLabel } from "./labels";
import { styles } from "./modal.styles";

interface Sent {
  url: string;
  emailSent: boolean;
  email: string;
}

/**
 * Adds a restaurant (no `restaurant` given) or invites the person who will run one. Both end the
 * same way: the invitation link in a read-only field, once. `onSaved` hands the returned row up
 * the moment the call succeeds, so the list is current behind the dialog; the link itself lives
 * only in this component's state, and closing the dialog unmounts it.
 *
 * Nothing is sent for an address that does not look like one or a name that is blank: the
 * refusal is shown and no call is made. A refusal from the server is shown as it came, and the
 * form stays as typed.
 *
 * @see [InvitationModal.test.tsx](../../../tests/components/admin/platform/InvitationModal.test.tsx)
 * — pins the prefilled address, the refusals that make no call, the link shown once and gone on
 * close, and the e-mail-sent wording on both sides.
 */
export function InvitationModal({
  restaurant,
  onSaved,
  onClose,
}: {
  restaurant?: PlatformRestaurant;
  onSaved: (restaurant: PlatformRestaurant) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors, primaryColor } = useAppTheme();
  const create = restaurant === undefined;

  const [name, setName] = useState("");
  const [email, setEmail] = useState(restaurant?.invitation?.email ?? restaurant?.ownerEmail ?? "");
  const [locale, setLocale] = useState<InvitationLocale>("fr");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);

  const resend = !create && (restaurant.invitation !== null || restaurant.ownerEmail !== null);
  const title = sent
    ? t("admin.platform.link.title")
    : create
      ? t("admin.platform.add.title")
      : t(resend ? "admin.platform.invite.titleResend" : "admin.platform.invite.titleFirst", {
          name: restaurant.name,
        });

  const submit = async () => {
    if (busy) return;
    const address = email.trim();
    if (create && !name.trim()) {
      setError(t("admin.platform.form.nameRequired"));
      return;
    }
    if (!isValidEmail(address)) {
      setError(t("admin.platform.form.invalidEmail"));
      return;
    }

    setError(null);
    setBusy(true);
    const result = create
      ? await createPlatformRestaurant({ name: name.trim(), ownerEmail: address, locale })
      : await sendPlatformInvitation(restaurant.id, { email: address, locale });
    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }
    onSaved(result.value.restaurant);
    setSent({
      url: result.value.invitationUrl,
      emailSent: result.value.emailSent,
      email: address,
    });
  };

  const close = () => {
    setSent(null);
    onClose();
  };

  return (
    <ModalCard
      visible
      title={title}
      onDismiss={close}
      dismissLabel={t("common.actions.close")}
      testID="invitation-modal"
    >
      {sent ? (
        <>
          <InvitationLinkPanel url={sent.url} emailSent={sent.emailSent} email={sent.email} />
          <View style={[styles.actions, { borderTopColor: colors.border }]}>
            <Button size="md" onPress={close}>
              {t("common.actions.close")}
            </Button>
          </View>
        </>
      ) : (
        <>
          <ThemedText style={[styles.intro, { color: colors.muted }]}>
            {create ? t("admin.platform.add.intro") : t("admin.platform.invite.intro")}
          </ThemedText>

          {create && (
            <View style={styles.field}>
              <ThemedText style={styles.label}>{t("admin.platform.form.nameLabel")}</ThemedText>
              <Input
                value={name}
                onChangeText={setName}
                maxLength={MAX_RESTAURANT_NAME_LENGTH}
                accessibilityLabel={t("admin.platform.form.nameLabel")}
              />
            </View>
          )}

          <View style={styles.field}>
            <ThemedText style={styles.label}>{t("admin.platform.form.emailLabel")}</ThemedText>
            <Input
              value={email}
              onChangeText={setEmail}
              maxLength={MAX_EMAIL_LENGTH}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={t("admin.platform.form.emailLabel")}
            />
          </View>

          <View style={styles.field}>
            <ThemedText style={styles.label}>{t("admin.platform.form.localeLabel")}</ThemedText>
            <View
              role="radiogroup"
              accessibilityLabel={t("admin.platform.form.localeLabel")}
              style={styles.choices}
            >
              {INVITATION_LOCALES.map((choice) => (
                <RowTextButton
                  key={choice}
                  label={invitationLocaleLabel(t, choice)}
                  color={primaryColor}
                  selected={locale === choice}
                  radio
                  onPress={() => setLocale(choice)}
                />
              ))}
            </View>
          </View>

          {error && (
            <ThemedText
              style={[styles.error, { color: theme.colors.error }]}
              role="alert"
              testID="invitation-error"
            >
              {error}
            </ThemedText>
          )}

          <View style={[styles.actions, { borderTopColor: colors.border }]}>
            <Button variant="secondary" tone="neutral" size="md" onPress={close}>
              {t("common.actions.cancel")}
            </Button>
            <Button size="md" loading={busy} onPress={submit}>
              {create ? t("admin.platform.add.submit") : t("admin.platform.invite.submit")}
            </Button>
          </View>
        </>
      )}
    </ModalCard>
  );
}

export default InvitationModal;
