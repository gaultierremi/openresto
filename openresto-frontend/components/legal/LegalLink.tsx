import { Pressable } from "react-native";
import { Link, type Href } from "expo-router";
import { ThemedText } from "@/components/themed-text";
import { Icon, type IconName } from "@/components/common/Icon";
import { useAppTheme } from "@/hooks/use-app-theme";
import { styles } from "./LegalLink.styles";

/** A text link inside a legal page: a named pill-free row, 44px tall so it is a real touch target. */
export function LegalLink({
  href,
  label,
  icon,
  testID,
}: {
  href: Href;
  label: string;
  icon?: IconName;
  testID?: string;
}) {
  const { primaryColor } = useAppTheme();

  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={label}
        style={styles.link}
        testID={testID}
      >
        {icon ? <Icon name={icon} size="sm" color={primaryColor} /> : null}
        <ThemedText style={[styles.label, { color: primaryColor }]}>{label}</ThemedText>
      </Pressable>
    </Link>
  );
}

export default LegalLink;
