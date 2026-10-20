import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/common/Icon";
import { useAppTheme } from "@/hooks/use-app-theme";
import { theme } from "@/theme/theme";
import { styles } from "./LegalReviewBanner.styles";

/**
 * The warning every legal page carries while its text has not been validated by a lawyer. It is
 * drawn above the scrolling page rather than in it, so it stays on screen the whole time the text
 * is being read, and it is never dismissible: a template read as if it were advice is the failure
 * it exists to prevent.
 *
 * @see [LegalReviewBanner.test.tsx](../../tests/components/legal/LegalReviewBanner.test.tsx) —
 * pins the wording and the alert role.
 */
export function LegalReviewBanner() {
  const { t } = useTranslation();
  const { colors } = useAppTheme();

  return (
    <View
      role="alert"
      testID="legal-review-banner"
      style={[
        styles.banner,
        { borderColor: theme.colors.warning, backgroundColor: `${theme.colors.warning}1f` },
      ]}
    >
      <Icon name="warning-outline" size="lg" color={theme.colors.warning} />
      <ThemedText style={[styles.text, { color: colors.text }]}>
        {t("common.legal.reviewBanner")}
      </ThemedText>
    </View>
  );
}

export default LegalReviewBanner;
