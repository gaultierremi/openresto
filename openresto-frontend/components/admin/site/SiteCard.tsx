import type { ReactNode } from "react";
import { View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { useAppTheme } from "@/hooks/use-app-theme";
import { styles } from "./SiteCard.styles";

/** The frame every block of the "Mon site" screen sits in: a title, a line saying what it is for, its fields. */
export function SiteCard({
  title,
  description,
  testID,
  children,
}: {
  title: string;
  description: string;
  testID?: string;
  children: ReactNode;
}) {
  const { colors } = useAppTheme();
  return (
    <View
      testID={testID}
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}
    >
      <View style={styles.header}>
        <ThemedText type="h3">{title}</ThemedText>
        <ThemedText style={[styles.description, { color: colors.muted }]}>{description}</ThemedText>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}
