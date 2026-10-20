import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import Input from "@/components/common/Input";
import { Icon } from "@/components/common/Icon";
import { useAppTheme } from "@/hooks/use-app-theme";
import { theme } from "@/theme/theme";
import { COPY_CONFIRMATION_MS, copyToClipboard } from "@/components/admin/settings/clipboard";
import { styles } from "./modal.styles";
import { styles as linkStyles } from "./InvitationLinkPanel.styles";

/**
 * The invitation link, shown once. The server keeps only a hash of the token, so this is the
 * one place the link exists: it lives in the parent's transient state for as long as the dialog
 * is open and nothing here writes it anywhere. The panel says whether the e-mail went out, and
 * when it did not, that the link has to be passed on by hand now.
 *
 * A copy is only confirmed once the write resolved, as in `ApiKeySecretModal`: a "Copied" over
 * a clipboard that was never written sends the admin away from the only screen that has the link.
 *
 * @see [InvitationLinkPanel.test.tsx](../../../tests/components/admin/platform/InvitationLinkPanel.test.tsx)
 * — pins the sent and not-sent wording, and that a failed copy is not confirmed.
 */
export function InvitationLinkPanel({
  url,
  emailSent,
  email,
}: {
  url: string;
  emailSent: boolean;
  email: string;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    []
  );

  const handleCopy = async () => {
    const ok = await copyToClipboard(url);
    setCopyState(ok ? "copied" : "failed");
    if (!ok) return;
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopyState("idle"), COPY_CONFIRMATION_MS);
  };

  const copied = copyState === "copied";
  const tone = emailSent ? theme.colors.success : theme.colors.warning;

  return (
    <View style={styles.field} testID="invitation-link-panel">
      <View
        role="status"
        style={[styles.notice, { borderColor: tone, backgroundColor: `${tone}14` }]}
      >
        <Icon
          name={emailSent ? "mail-outline" : "warning-outline"}
          size="sm"
          color={tone}
          style={styles.noticeIcon}
        />
        <View style={styles.noticeBody}>
          <ThemedText style={styles.noticeText} testID="invitation-email-status">
            {emailSent
              ? t("admin.platform.link.emailSent", { email })
              : t("admin.platform.link.emailNotSent")}
          </ThemedText>
          {!emailSent && (
            <ThemedText style={styles.noticeTitle} testID="invitation-must-copy">
              {t("admin.platform.link.mustCopy")}
            </ThemedText>
          )}
        </View>
      </View>

      <ThemedText style={styles.label}>{t("admin.platform.link.label")}</ThemedText>
      <View style={linkStyles.linkRow}>
        <View style={linkStyles.linkField}>
          <Input
            value={url}
            editable={false}
            selectTextOnFocus
            accessibilityLabel={t("admin.platform.link.label")}
            testID="invitation-link"
          />
        </View>
        <Button
          variant="secondary"
          size="md"
          icon={copied ? "checkmark" : "copy-outline"}
          onPress={handleCopy}
        >
          {copied ? t("admin.platform.link.copied") : t("admin.platform.link.copy")}
        </Button>
      </View>

      {copyState === "failed" && (
        <ThemedText
          style={[styles.error, { color: theme.colors.error }]}
          role="alert"
          testID="invitation-copy-failed"
        >
          {t("admin.platform.link.copyFailed")}
        </ThemedText>
      )}
      <ThemedText style={[styles.hint, { color: colors.muted }]}>
        {t("admin.platform.link.onceNotice")}
      </ThemedText>
    </View>
  );
}

export default InvitationLinkPanel;
