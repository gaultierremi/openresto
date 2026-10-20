import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Input from "@/components/common/Input";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import { useAppTheme } from "@/hooks/use-app-theme";
import { MAX_NAME_LENGTH } from "@/constants/menu";
import { styles } from "./AddEntryForm.styles";

/**
 * The standing "add" control under a list of menus, categories or dishes: one button that opens
 * a name field (and, for a dish, a price) and stays open on a refusal. It is its own component
 * rather than `AddRow` because `AddRow` closes whatever the call answered, and a menu form that
 * swallows "name too long" or a malformed price leaves the admin wondering where their entry went.
 *
 * @see [AddEntryForm.test.tsx](../../../tests/components/admin/menus/AddEntryForm.test.tsx) —
 * pins that a refusal keeps the form open with its message, and a success closes and clears it.
 */
export function AddEntryForm({
  label,
  placeholder,
  pricePlaceholder,
  onAdd,
  testID,
}: {
  label: string;
  placeholder: string;
  /** Set for a dish: shows a price field, whose text is handed to `onAdd` untouched. */
  pricePlaceholder?: string;
  /** Resolves null when the entry was created, or the message to show when it was refused. */
  onAdd: (name: string, priceText: string) => Promise<string | null>;
  testID?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setName("");
    setPrice("");
    setError(null);
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    const failure = await onAdd(name.trim(), price);
    setBusy(false);
    if (failure) setError(failure);
    else close();
  };

  if (!open) {
    return (
      <ButtonRow align="start">
        <Button size="md" icon="add" onPress={() => setOpen(true)} testID={testID}>
          {label}
        </Button>
      </ButtonRow>
    );
  }

  return (
    <View style={styles.form}>
      <View style={styles.fields}>
        <View style={styles.nameField}>
          <Input
            value={name}
            onChangeText={setName}
            placeholder={placeholder}
            maxLength={MAX_NAME_LENGTH}
            accessibilityLabel={placeholder}
            testID={testID ? `${testID}-name` : undefined}
            autoFocus
          />
        </View>
        {pricePlaceholder !== undefined && (
          <View style={styles.priceField}>
            <Input
              value={price}
              onChangeText={setPrice}
              placeholder={pricePlaceholder}
              accessibilityLabel={pricePlaceholder}
              keyboardType="decimal-pad"
              testID={testID ? `${testID}-price` : undefined}
            />
          </View>
        )}
      </View>
      {error && (
        <ThemedText style={[styles.error, { color: colors.error }]} role="alert">
          {error}
        </ThemedText>
      )}
      <ButtonRow>
        <Button variant="secondary" tone="neutral" size="md" onPress={close}>
          {t("common.actions.cancel")}
        </Button>
        <Button
          size="md"
          loading={busy}
          disabled={!name.trim()}
          onPress={submit}
          testID={testID ? `${testID}-submit` : undefined}
        >
          {t("admin.settings.addRow.add")}
        </Button>
      </ButtonRow>
    </View>
  );
}
