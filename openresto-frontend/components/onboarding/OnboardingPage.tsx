import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAppTheme } from "@/hooks/use-app-theme";
import { NARROW_WIDTH, WIDE_WIDTH, styles } from "./OnboardingPage.styles";

/**
 * The page every screen of the restaurateur's space sits on: the platform's name with the
 * "restaurateur space" badge above a centred column. The narrow column is for the screens that
 * are one card (sign-in, the invitation, a message), the wide one for the assistant.
 */
export function OnboardingPage({
  width = "narrow",
  centered = false,
  children,
}: {
  width?: "narrow" | "wide";
  /** Centres the column vertically, for a single card. */
  centered?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { brand, colors, primaryColor } = useAppTheme();

  return (
    <ThemedView style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.outer, centered && styles.centered]}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[styles.container, { maxWidth: width === "wide" ? WIDE_WIDTH : NARROW_WIDTH }]}
        >
          <View style={styles.brandRow}>
            <ThemedText style={[styles.brand, { color: primaryColor }]} numberOfLines={1}>
              {brand.appName}
            </ThemedText>
            <ThemedText style={[styles.badge, { color: colors.muted }]}>
              {t("admin.onboarding.badge")}
            </ThemedText>
          </View>
          {children}
        </View>
      </ScrollView>
    </ThemedView>
  );
}
