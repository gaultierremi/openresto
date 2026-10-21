import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import { Icon, type IconName } from "@/components/common/Icon";
import { useAppTheme } from "@/hooks/use-app-theme";
import { theme } from "@/theme/theme";
import type { PlatformStatus } from "@/constants/platform";
import { statusLabel } from "./labels";
import { styles } from "./PlatformStatusBadge.styles";

type Pair = { light: string; dark: string };
type Look = { icon: IconName; bg: Pair; text: Pair };

/** The dark text values are the lighter step of each hue: the theme's own status text is tuned for a light card. */
const LOOKS: Record<PlatformStatus, Look> = {
  Draft: {
    icon: "create-outline",
    bg: theme.status.scheduled.bg,
    text: { light: theme.status.scheduled.text, dark: "#cbd5e1" },
  },
  Published: {
    icon: "checkmark-circle-outline",
    bg: theme.status.arrived.bg,
    text: { light: theme.status.arrived.text, dark: "#4ade80" },
  },
  Suspended: {
    icon: "pause-circle-outline",
    bg: theme.status.cancelled.bg,
    text: { light: theme.status.cancelled.text, dark: "#f87171" },
  },
};

/**
 * A restaurant's status as an icon, a tint and its name. The name is always printed: a status
 * carried by colour alone is not one for the reader who cannot tell the two apart.
 *
 * @see [PlatformStatusBadge.test.tsx](../../../tests/components/admin/platform/PlatformStatusBadge.test.tsx)
 * — pins that each status prints its own name, and that one this build does not know is shown
 * as the server sent it rather than blank.
 */
export function PlatformStatusBadge({ status }: { status: PlatformStatus }) {
  const { t } = useTranslation();
  const { isDark } = useAppTheme();
  const look = LOOKS[status] ?? LOOKS.Draft;
  const mode = isDark ? "dark" : "light";

  return (
    <View testID="platform-status-badge" style={[styles.badge, { backgroundColor: look.bg[mode] }]}>
      <Icon name={look.icon} size="sm" color={look.text[mode]} />
      <ThemedText style={[styles.text, { color: look.text[mode] }]}>
        {statusLabel(t, status)}
      </ThemedText>
    </View>
  );
}

export default PlatformStatusBadge;
