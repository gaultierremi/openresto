import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { Stack, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import { useAppTheme } from "@/hooks/use-app-theme";
import { theme } from "@/theme/theme";
import {
  fetchLegalDocument,
  fetchLegalDocuments,
  type LegalDocument,
  type LegalDocumentSummary,
} from "@/api/legal";
import { LegalLink } from "./LegalLink";
import { LegalPageShell } from "./LegalPageShell";
import { legalDocumentLabel, legalUpdatedOn } from "./legalLabels";
import { styles } from "./LegalIndexScreen.styles";

interface Entry {
  summary: LegalDocumentSummary;
  /** Null when this document's own fetch failed: the list still links it, by its generic name. */
  document: LegalDocument | null;
}

type Load = { status: "loading" } | { status: "error" } | { status: "ready"; entries: Entry[] };

/**
 * The index of the platform's legal documents. The list endpoint carries only a key and a version,
 * so each document is fetched too: that is what gives the page the real titles and, above all,
 * whether the texts still need a lawyer. When that cannot be established (a document would not
 * load) the warning is shown anyway, because a missing answer is not a clean one.
 *
 * @see [LegalIndexScreen.test.tsx](../../tests/components/legal/LegalIndexScreen.test.tsx) — pins
 * the titles and versions, the banner when a text needs review and when one could not be read,
 * its absence when every text is validated, and a failed list that can be retried.
 */
export function LegalIndexScreen() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [load, setLoad] = useState<Load>({ status: "loading" });

  const refresh = useCallback(() => {
    setLoad({ status: "loading" });
    fetchLegalDocuments().then(async (list) => {
      if (!list.ok) {
        setLoad({ status: "error" });
        return;
      }
      const documents = await Promise.all(list.value.map((s) => fetchLegalDocument(s.key)));
      setLoad({
        status: "ready",
        entries: list.value.map((summary, index) => {
          const fetched = documents[index];
          return { summary, document: fetched.ok ? fetched.value : null };
        }),
      });
    });
  }, []);

  useEffect(refresh, [refresh]);

  const reviewPending =
    load.status === "ready" &&
    load.entries.some((entry) => entry.document === null || entry.document.needsLegalReview);

  return (
    <LegalPageShell reviewPending={reviewPending}>
      {Platform.OS !== "web" && <Stack.Screen options={{ title: t("common.legal.indexTitle") }} />}
      <View style={styles.header}>
        <ThemedText type="h1" accessibilityRole="header" aria-level={1}>
          {t("common.legal.indexTitle")}
        </ThemedText>
        <ThemedText style={[styles.meta, { color: colors.muted }]}>
          {t("common.legal.indexIntro")}
        </ThemedText>
        <ThemedText style={[styles.meta, { color: colors.muted }]} testID="legal-language-note">
          {t("common.legal.languageNote")}
        </ThemedText>
      </View>

      {load.status === "loading" ? (
        <ActivityIndicator color={colors.muted} />
      ) : load.status === "error" ? (
        <View style={styles.header}>
          <ThemedText style={{ color: theme.colors.error }} role="alert">
            {t("common.legal.loadFailed")}
          </ThemedText>
          <Button variant="secondary" size="md" onPress={refresh}>
            {t("common.actions.tryAgain")}
          </Button>
        </View>
      ) : (
        <View role="list" style={styles.list}>
          {load.entries.map(({ summary, document }) => (
            <View
              key={summary.key}
              role="listitem"
              testID={`legal-entry-${summary.key}`}
              style={[styles.entry, { borderColor: colors.border, backgroundColor: colors.card }]}
            >
              <ThemedText type="h3">
                {document?.title ?? legalDocumentLabel(t, summary.key)}
              </ThemedText>
              {document && (
                <ThemedText style={[styles.meta, { color: colors.muted }]}>
                  {t("common.legal.versionLine", {
                    version: document.version,
                    date: legalUpdatedOn(document.updatedOn),
                  })}
                </ThemedText>
              )}
              <LegalLink
                href={`/legal/${summary.key}` as Href}
                label={t("common.legal.openDocument")}
                icon="document-text-outline"
                testID={`legal-open-${summary.key}`}
              />
            </View>
          ))}
        </View>
      )}

      <LegalLink href={"/" as Href} label={t("common.actions.goHome")} icon="arrow-back-outline" />
    </LegalPageShell>
  );
}

export default LegalIndexScreen;
