import { Pressable, View } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { Icon } from "@/components/common/Icon";
import { useAppTheme } from "@/hooks/use-app-theme";
import { BOX_SIZE, styles } from "./ConsentCheckbox.styles";

/**
 * One acceptance: a box, the sentence it stands for and a link to read the document first. The
 * box and its sentence both toggle it; the link only opens the document, so reading is never an
 * accident of ticking.
 */
export function ConsentCheckbox({
  checked,
  onChange,
  label,
  linkLabel,
  onOpen,
  testID,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  linkLabel: string;
  onOpen: () => void;
  testID: string;
}) {
  const { colors, primaryColor } = useAppTheme();
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onChange(!checked)}
        role="checkbox"
        aria-checked={checked}
        accessibilityState={{ checked }}
        accessibilityLabel={label}
        style={[
          styles.box,
          {
            borderColor: checked ? primaryColor : colors.borderStrong,
            backgroundColor: checked ? primaryColor : "transparent",
          },
        ]}
        testID={testID}
      >
        {checked ? <Icon name="checkmark" size={BOX_SIZE - 8} color="#fff" /> : null}
      </Pressable>
      <View style={styles.text}>
        <Pressable onPress={() => onChange(!checked)} accessible={false}>
          <ThemedText style={styles.label}>{label}</ThemedText>
        </Pressable>
        <Pressable
          onPress={onOpen}
          role="link"
          accessibilityLabel={linkLabel}
          testID={`${testID}-link`}
        >
          <ThemedText style={[styles.link, { color: primaryColor }]}>{linkLabel}</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}
