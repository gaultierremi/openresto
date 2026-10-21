import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import { ModalCard } from "@/components/common/ModalCard";
import { useAppTheme } from "@/hooks/use-app-theme";
import { theme } from "@/theme/theme";
import { fmtDateTime } from "@/utils/formatters";
import { legalDocumentLabel } from "@/components/legal/legalLabels";
import {
  fetchPlatformConsents,
  type LegalAcceptance,
  type PlatformRestaurant,
} from "@/api/platform";
import { styles as modalStyles } from "./modal.styles";
import { styles } from "./ConsentsModal.styles";

/** Enough of a SHA-256 to compare two records by eye; the full hash is what the server keeps. */
const SHORT_HASH_LENGTH = 12;

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: LegalAcceptance[] };

/**
 * What a restaurant's account accepted at sign-up: which document, which version, who, when,
 * and a short fingerprint of the exact text shown. Read-only, and e-mails are the restaurateur's
 * own, never a guest's.
 *
 * @see [ConsentsModal.test.tsx](../../../tests/components/admin/platform/ConsentsModal.test.tsx)
 * — pins the rows, the empty state and the refusal.
 */
export function ConsentsModal({
  restaurant,
  onClose,
}: {
  restaurant: PlatformRestaurant;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchPlatformConsents(restaurant.id).then((result) => {
      if (cancelled) return;
      setLoad(
        result.ok
          ? { status: "ready", rows: result.value }
          : { status: "error", message: result.message }
      );
    });
    return () => {
      cancelled = true;
    };
  }, [restaurant.id]);

  return (
    <ModalCard
      visible
      title={t("admin.platform.consents.title", { name: restaurant.name })}
      onDismiss={onClose}
      dismissLabel={t("common.actions.close")}
      testID="consents-modal"
    >
      <ThemedText style={[modalStyles.intro, { color: colors.muted }]}>
        {t("admin.platform.consents.intro")}
      </ThemedText>

      {load.status === "loading" ? (
        <ActivityIndicator color={colors.muted} />
      ) : load.status === "error" ? (
        <ThemedText style={{ color: theme.colors.error }} role="alert">
          {t("admin.platform.consents.loadFailed")} {load.message}
        </ThemedText>
      ) : load.rows.length === 0 ? (
        <ThemedText style={{ color: colors.muted }} testID="consents-empty">
          {t("admin.platform.consents.empty")}
        </ThemedText>
      ) : (
        <View role="list" style={styles.list}>
          {load.rows.map((row) => (
            <View
              key={`${row.documentKey}|${row.version}|${row.email}|${row.acceptedAt}`}
              role="listitem"
              testID="consent-row"
              style={[styles.row, { borderColor: colors.border }]}
            >
              <ThemedText style={styles.document}>
                {legalDocumentLabel(t, row.documentKey)}
              </ThemedText>
              <ThemedText style={[styles.detail, { color: colors.muted }]}>
                {t("admin.platform.consents.versionLine", { version: row.version })}
              </ThemedText>
              <ThemedText style={[styles.detail, { color: colors.muted }]}>
                {t("admin.platform.consents.emailLine", { email: row.email })}
              </ThemedText>
              <ThemedText style={[styles.detail, { color: colors.muted }]}>
                {t("admin.platform.consents.dateLine", {
                  date: fmtDateTime(new Date(row.acceptedAt)),
                })}
              </ThemedText>
              <ThemedText style={[styles.detail, { color: colors.muted }]}>
                {t("admin.platform.consents.fingerprintLine", {
                  hash: row.contentSha256.slice(0, SHORT_HASH_LENGTH),
                })}
              </ThemedText>
            </View>
          ))}
        </View>
      )}

      <View style={[modalStyles.actions, { borderTopColor: colors.border }]}>
        <Button size="md" onPress={onClose}>
          {t("common.actions.close")}
        </Button>
      </View>
    </ModalCard>
  );
}

export default ConsentsModal;
