import { useMemo, useState } from "react";
import { Image, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import ConfirmModal from "@/components/common/ConfirmModal";
import { useAppTheme } from "@/hooks/use-app-theme";
import { downloadQrPng, downloadQrSvg, fileSlug } from "@/utils/qrDownload";
import { qrToSvg, svgToDataUri } from "@/utils/qrCode";
import { styles } from "./QrTile.styles";

/**
 * One QR code on screen: the code, the address it opens, and what an admin does with it —
 * download it as PNG or SVG, and, for an Owner, replace it. Regenerating is the one action here
 * that breaks something already printed, so it sits behind a confirmation that says which half
 * of that is true: the old code stops working at once.
 *
 * @see [QrTile.test.tsx](../../../tests/components/admin/qr/QrTile.test.tsx) — pins the
 * downloads, the confirmation wording, that Cancel leaves the token alone, and that only a
 * caller who may regenerate is offered the button.
 */
export function QrTile({
  title,
  subtitle,
  url,
  fileBase,
  canRegenerate,
  onRegenerate,
  testID,
}: {
  title: string;
  subtitle?: string;
  url: string;
  /** What the downloaded files are named after: restaurant, then table. */
  fileBase: string[];
  canRegenerate: boolean;
  /** Resolves null when the token was replaced, or the message to show when it was not. */
  onRegenerate: () => Promise<string | null>;
  testID: string;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const svg = useMemo(() => qrToSvg(url), [url]);
  const dataUri = useMemo(() => svgToDataUri(svg), [svg]);
  const filename = fileSlug(...fileBase);

  const downloadPng = async () => {
    const done = await downloadQrPng(`${filename}.png`, url);
    setMessage(done ? null : { text: t("admin.qrCodes.downloadFailed"), ok: false });
  };

  const regenerate = async () => {
    setBusy(true);
    const failure = await onRegenerate();
    setBusy(false);
    setConfirming(false);
    setMessage(
      failure ? { text: failure, ok: false } : { text: t("admin.qrCodes.regenerated"), ok: true }
    );
  };

  return (
    <View
      style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}
      testID={testID}
    >
      <Image
        source={{ uri: dataUri }}
        style={styles.code}
        accessibilityLabel={t("admin.qrCodes.codeLabel", { name: title })}
        resizeMode="contain"
      />
      <View style={styles.text}>
        <ThemedText type="h3">{title}</ThemedText>
        {subtitle ? (
          <ThemedText style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</ThemedText>
        ) : null}
        <ThemedText
          style={[styles.url, { color: colors.muted }]}
          selectable
          testID={`${testID}-url`}
        >
          {url}
        </ThemedText>
        <ButtonRow align="start">
          <Button
            size="sm"
            variant="secondary"
            icon="download-outline"
            onPress={downloadPng}
            testID={`${testID}-png`}
          >
            {t("admin.qrCodes.downloadPng")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon="download-outline"
            onPress={() => downloadQrSvg(`${filename}.svg`, svg)}
            testID={`${testID}-svg`}
          >
            {t("admin.qrCodes.downloadSvg")}
          </Button>
          {canRegenerate && (
            <Button
              size="sm"
              variant="secondary"
              tone="danger"
              icon="refresh-outline"
              onPress={() => setConfirming(true)}
              testID={`${testID}-regenerate`}
            >
              {t("admin.qrCodes.regenerate")}
            </Button>
          )}
        </ButtonRow>
        {message && (
          <ThemedText
            style={[styles.message, { color: message.ok ? colors.success : colors.error }]}
            role={message.ok ? "status" : "alert"}
          >
            {message.text}
          </ThemedText>
        )}
      </View>

      <ConfirmModal
        visible={confirming}
        destructive
        loading={busy}
        title={t("admin.qrCodes.regenerateTitle")}
        message={t("admin.qrCodes.regenerateMessage", { name: title })}
        confirmLabel={t("admin.qrCodes.regenerateConfirm")}
        onConfirm={regenerate}
        onCancel={() => setConfirming(false)}
      />
    </View>
  );
}
