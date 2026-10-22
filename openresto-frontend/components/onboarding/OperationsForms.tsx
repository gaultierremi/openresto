import { useState } from "react";
import { Switch, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import { Field } from "./formParts";
import { useAppTheme } from "@/hooks/use-app-theme";
import { styles } from "./OperationsDashboard.styles";
import type { ServiceException } from "@/api/operations";

export function OperationsInput({
  label,
  value,
  onChange,
  testID,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  testID: string;
}) {
  const { colors } = useAppTheme();
  return (
    <Field label={label} style={styles.field}>
      <TextInput
        accessibilityLabel={label}
        testID={testID}
        value={value}
        onChangeText={onChange}
        style={[
          styles.input,
          { color: colors.text, backgroundColor: colors.card, borderColor: colors.borderStrong },
        ]}
      />
    </Field>
  );
}

export function ExceptionForm({
  today,
  disabled,
  onAdd,
}: {
  today: string;
  disabled: boolean;
  onAdd: (input: ServiceException) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(today);
  const [open, setOpen] = useState("12:00");
  const [close, setClose] = useState("22:00");
  const [closed, setClosed] = useState(true);
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    date >= today &&
    (closed || [open, close].every((v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v)));
  return (
    <View style={styles.stack}>
      <View style={styles.form}>
        <OperationsInput
          label={t("admin.operations.date")}
          value={date}
          onChange={setDate}
          testID="exception-date"
        />
        <Field label={t("admin.operations.closed")}>
          <Switch
            accessibilityLabel={t("admin.operations.closed")}
            value={closed}
            onValueChange={setClosed}
            disabled={disabled}
          />
        </Field>
      </View>
      {!closed && (
        <View style={styles.form}>
          <OperationsInput
            label={t("admin.operations.open")}
            value={open}
            onChange={setOpen}
            testID="exception-open"
          />
          <OperationsInput
            label={t("admin.operations.close")}
            value={close}
            onChange={setClose}
            testID="exception-close"
          />
        </View>
      )}
      <ButtonRow align="start">
        <Button
          size="md"
          disabled={disabled || !valid}
          testID="exception-add"
          onPress={() => {
            if (!valid || disabled) return;
            void onAdd({ date, closed, open, close });
          }}
        >
          {t("admin.operations.addException")}
        </Button>
      </ButtonRow>
    </View>
  );
}

export function WaitlistForm({
  disabled,
  onAdd,
}: {
  disabled: boolean;
  onAdd: (name: string, seats: number, email: string) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [seats, setSeats] = useState("2");
  const [email, setEmail] = useState("");
  const valid =
    name.trim().length > 0 &&
    name.trim().length <= 80 &&
    /^\d+$/.test(seats) &&
    Number(seats) >= 1 &&
    Number(seats) <= 50 &&
    (!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  return (
    <View style={styles.stack}>
      <View style={styles.form}>
        <OperationsInput
          label={t("admin.operations.name")}
          value={name}
          onChange={setName}
          testID="waitlist-name"
        />
        <OperationsInput
          label={t("admin.operations.seats")}
          value={seats}
          onChange={setSeats}
          testID="waitlist-seats"
        />
        <OperationsInput
          label={t("admin.operations.email")}
          value={email}
          onChange={setEmail}
          testID="waitlist-email"
        />
      </View>
      <ButtonRow align="start">
        <Button
          size="md"
          disabled={disabled || !valid}
          testID="waitlist-add"
          onPress={async () => {
            if (!valid || disabled) return;
            if (await onAdd(name.trim(), Number(seats), email.trim())) {
              setName("");
              setEmail("");
            }
          }}
        >
          {t("admin.operations.addWaitlist")}
        </Button>
      </ButtonRow>
    </View>
  );
}
