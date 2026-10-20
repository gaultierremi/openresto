import type { ReactNode } from "react";
import { View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { Icon, type IconName } from "@/components/common/Icon";
import { useAppTheme } from "@/hooks/use-app-theme";
import { styles } from "./MessageCard.styles";

/** A screen that is one sentence and, sometimes, one way out: an invalid link, no such restaurant. */
export function MessageCard({
  icon,
  title,
  body,
  testID,
  children,
}: {
  icon: IconName;
  title: string;
  body: string;
  testID?: string;
  children?: ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      testID={testID}
    >
      <Icon name={icon} size={32} color={colors.muted} />
      <ThemedText style={styles.title} role="heading">
        {title}
      </ThemedText>
      <ThemedText style={[styles.body, { color: colors.muted }]}>{body}</ThemedText>
      {children}
    </View>
  );
}
