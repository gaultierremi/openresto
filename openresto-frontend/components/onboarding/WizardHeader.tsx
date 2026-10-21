import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import { theme } from "@/theme/theme";
import type { RestaurantStatus } from "@/constants/onboarding";
import { styles } from "./WizardHeader.styles";

const BADGE_COLORS: Record<RestaurantStatus, { background: string; text: string }> = {
  Draft: { background: theme.status.upcoming.bg.light, text: theme.status.upcoming.text },
  Published: { background: theme.badge.active.bg, text: theme.badge.active.text },
  Suspended: { background: theme.status.cancelled.bg.light, text: theme.status.cancelled.text },
};

/** The restaurant's name, where it stands (draft, published, suspended) and the way out. */
export function WizardHeader({
  name,
  status,
  onSignOut,
}: {
  name: string;
  status: RestaurantStatus;
  onSignOut: () => void;
}) {
  const { t } = useTranslation();
  const badge = BADGE_COLORS[status];

  return (
    <View style={styles.header}>
      <View style={styles.identity}>
        <ThemedText style={styles.name} role="heading" testID="wizard-name">
          {name}
        </ThemedText>
        <View
          style={[styles.badge, { backgroundColor: badge.background }]}
          testID="wizard-status"
          accessibilityLabel={t(`admin.onboarding.status.${status}`)}
        >
          <ThemedText style={[styles.badgeText, { color: badge.text }]}>
            {t(`admin.onboarding.status.${status}`)}
          </ThemedText>
        </View>
      </View>
      <Button
        variant="ghost"
        tone="neutral"
        size="md"
        icon="log-out-outline"
        onPress={onSignOut}
        testID="wizard-sign-out"
      >
        {t("admin.onboarding.common.signOut")}
      </Button>
    </View>
  );
}
