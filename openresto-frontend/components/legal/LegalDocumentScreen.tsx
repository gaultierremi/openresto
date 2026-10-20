import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Platform, View } from "react-native";
import { Stack, type Href } from "expo-router";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import { useAppTheme } from "@/hooks/use-app-theme";
import { theme } from "@/theme/theme";
import { fetchLegalDocument, type LegalDocument } from "@/api/legal";
import { LEGAL_DOCUMENT_KEYS, LEGAL_NOT_FOUND_CODE } from "@/constants/platform";
import { LegalLink } from "./LegalLink";
import { LegalPageShell } from "./LegalPageShell";
import { LegalParagraph } from "./LegalParagraph";
import { legalDocumentLabel, legalUpdatedOn } from "./legalLabels";
import { styles } from "./LegalDocumentScreen.styles";

type Load =
  | { status: "loading" }
  | { status: "notFound" }
  | { status: "error" }
  | { status: "ready"; document: LegalDocument };

/**
 * One legal document, public. While its text is a template (`needsLegalReview`) the page says so
 * in a banner that stays on screen, and the bracketed fields the operator still has to fill in are
 * shown as they are. A key the server does not know (`legal.document_not_found`) is its own state,
 * with the way back to the list, and not a generic failure: the two want different next steps.
 *
 * @see [LegalDocumentScreen.test.tsx](../../tests/components/legal/LegalDocumentScreen.test.tsx) —
 * pins the banner on both sides of `needsLegalReview`, the unknown key, a failed load that can be
 * retried, and the links to the other documents.
 */
export function LegalDocumentScreen({ docKey }: { docKey: string }) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [load, setLoad] = useState<Load>({ status: "loading" });

  const refresh = useCallback(() => {
    setLoad({ status: "loading" });
    fetchLegalDocument(docKey).then((result) => {
      if (result.ok) setLoad({ status: "ready", document: result.value });
      else setLoad({ status: result.code === LEGAL_NOT_FOUND_CODE ? "notFound" : "error" });
    });
  }, [docKey]);

  useEffect(refresh, [refresh]);

  const back = (
    <LegalLink
      href={"/legal" as Href}
      label={t("common.legal.back")}
      icon="arrow-back-outline"
      testID="legal-back"
    />
  );

  if (load.status === "ready") {
    const doc = load.document;
    return (
      <LegalPageShell reviewPending={doc.needsLegalReview}>
        {Platform.OS !== "web" && <Stack.Screen options={{ title: doc.title }} />}
        {back}
        <View style={styles.header}>
          <ThemedText type="h1" accessibilityRole="header" aria-level={1}>
            {doc.title}
          </ThemedText>
          <ThemedText style={[styles.meta, { color: colors.muted }]} testID="legal-version">
            {t("common.legal.versionLine", {
              version: doc.version,
              date: legalUpdatedOn(doc.updatedOn),
            })}
          </ThemedText>
          <ThemedText style={[styles.meta, { color: colors.muted }]} testID="legal-language-note">
            {t("common.legal.languageNote")}
          </ThemedText>
        </View>

        {doc.sections.map((section) => (
          <View key={section.heading} style={styles.section} testID="legal-section">
            <ThemedText type="h3" accessibilityRole="header" aria-level={2}>
              {section.heading}
            </ThemedText>
            {section.paragraphs.map((paragraph, index) => (
              <LegalParagraph key={index} text={paragraph} />
            ))}
          </View>
        ))}

        <View style={[styles.others, { borderTopColor: colors.border }]}>
          <ThemedText type="h3" accessibilityRole="header" aria-level={2}>
            {t("common.legal.otherDocuments")}
          </ThemedText>
          {LEGAL_DOCUMENT_KEYS.filter((key) => key !== doc.key).map((key) => (
            <LegalLink
              key={key}
              href={`/legal/${key}` as Href}
              label={legalDocumentLabel(t, key)}
              testID={`legal-link-${key}`}
            />
          ))}
        </View>
      </LegalPageShell>
    );
  }

  return (
    <LegalPageShell reviewPending={false}>
      {back}
      {load.status === "loading" ? (
        <ActivityIndicator color={colors.muted} />
      ) : load.status === "notFound" ? (
        <View style={styles.header} testID="legal-not-found">
          <ThemedText type="h1" accessibilityRole="header" aria-level={1}>
            {t("common.legal.notFoundTitle")}
          </ThemedText>
          <ThemedText style={[styles.meta, { color: colors.muted }]}>
            {t("common.legal.notFoundBody")}
          </ThemedText>
        </View>
      ) : (
        <View style={styles.header}>
          <ThemedText style={{ color: theme.colors.error }} role="alert">
            {t("common.legal.loadFailed")}
          </ThemedText>
          <Button variant="secondary" size="md" onPress={refresh}>
            {t("common.actions.tryAgain")}
          </Button>
        </View>
      )}
    </LegalPageShell>
  );
}

export default LegalDocumentScreen;
