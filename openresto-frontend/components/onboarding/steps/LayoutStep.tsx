import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import Input from "@/components/common/Input";
import Stepper from "@/components/common/Stepper";
import { RowTextButton } from "@/components/common/RowTextButton";
import { Banner, Field } from "@/components/onboarding/formParts";
import { StepShell } from "@/components/onboarding/StepShell";
import { saveLayout } from "@/api/onboarding";
import { useOnboardingCall } from "@/hooks/use-onboarding-call";
import { useAppTheme } from "@/hooks/use-app-theme";
import {
  MAX_SEATS,
  MAX_SECTION_NAME_LENGTH,
  MAX_TABLE_NAME_LENGTH,
  MIN_SEATS,
} from "@/constants/onboarding";
import {
  addRoom,
  addTable,
  draftFromLayout,
  layoutFromDraft,
  patchTable,
  removeRoom,
  removeTable,
  renameRoom,
  tableCount,
  unnamedRoom,
  type DraftRoom,
} from "@/utils/onboardingLayout";
import type { StepProps } from "@/types/onboarding";
import { styles } from "./LayoutStep.styles";

const SEAT_OPTIONS = Array.from({ length: MAX_SEATS - MIN_SEATS + 1 }, (_, i) => ({
  label: String(MIN_SEATS + i),
  value: MIN_SEATS + i,
}));

/**
 * Step 3: the rooms and the tables in them. The whole layout is what is sent: a row that exists
 * carries its id, a new one none, and a row that is gone from the form is gone from the
 * restaurant, except that a table with an upcoming booking cannot go. That refusal arrives as a
 * message and the form is left exactly as it was, so nothing typed is lost to it.
 *
 * @see [LayoutStep.test.tsx](../../../tests/components/onboarding/steps/LayoutStep.test.tsx) —
 * pins ids on what exists and none on what is new, a layout with no table being unsendable, an
 * unnamed room being refused with nothing sent, and the in-use refusal keeping the form.
 */
export function LayoutStep({
  restaurantId,
  state,
  readOnly,
  onState,
  onAdvance,
  onBack,
  onExpired,
}: StepProps) {
  const { t } = useTranslation();
  const { colors } = useAppTheme();
  const [rooms, setRooms] = useState<DraftRoom[]>(() =>
    draftFromLayout(state.layout, t("admin.onboarding.layout.defaultRoomName"))
  );
  const [unnamed, setUnnamed] = useState<string | null>(null);
  const { busy, error, run, clear } = useOnboardingCall(onExpired);

  const noTable = tableCount(rooms) === 0;

  const submit = async () => {
    const missing = unnamedRoom(rooms);
    if (missing) {
      clear();
      setUnnamed(missing);
      return;
    }
    setUnnamed(null);
    const saved = await run(() => saveLayout(restaurantId, layoutFromDraft(rooms)));
    if (saved) {
      onState(saved);
      onAdvance();
    }
  };

  return (
    <StepShell
      testID="step-layout"
      title={t("admin.onboarding.layout.title")}
      description={t("admin.onboarding.layout.description")}
      readOnly={readOnly}
      busy={busy}
      primaryDisabled={noTable}
      onPrimary={submit}
      onNext={onAdvance}
      onBack={onBack}
    >
      {error ? <Banner testID="step-layout-banner">{error.message}</Banner> : null}

      <View style={styles.rooms}>
        {rooms.map((room, roomIndex) => (
          <View
            key={room.key}
            style={[styles.room, { borderColor: colors.border }]}
            testID={`room-${roomIndex}`}
          >
            <View style={styles.roomHeader}>
              <Field
                label={t("admin.onboarding.layout.roomNameLabel")}
                error={unnamed === room.key ? t("errors.onboarding.layout_invalid") : null}
                style={styles.roomName}
                testID={`room-${roomIndex}-name-field`}
              >
                <Input
                  value={room.name}
                  onChangeText={(name) => {
                    setRooms(renameRoom(rooms, room.key, name));
                    setUnnamed(null);
                  }}
                  editable={!readOnly}
                  maxLength={MAX_SECTION_NAME_LENGTH}
                  accessibilityLabel={t("admin.onboarding.layout.roomNameLabel")}
                  testID={`room-${roomIndex}-name`}
                />
              </Field>
              <RowTextButton
                label={t("admin.onboarding.layout.removeRoom")}
                color={colors.error}
                icon="trash-outline"
                onPress={() => setRooms(removeRoom(rooms, room.key))}
                testID={`room-${roomIndex}-remove`}
              />
            </View>

            <View style={styles.tables}>
              {room.tables.map((table, tableIndex) => (
                <View
                  key={table.key}
                  style={styles.table}
                  testID={`room-${roomIndex}-table-${tableIndex}`}
                >
                  <View style={styles.tableName}>
                    <Input
                      value={table.name}
                      onChangeText={(name) =>
                        setRooms(patchTable(rooms, room.key, table.key, { name }))
                      }
                      editable={!readOnly}
                      maxLength={MAX_TABLE_NAME_LENGTH}
                      placeholder={t("admin.onboarding.layout.tableNamePlaceholder")}
                      accessibilityLabel={t("admin.onboarding.layout.tableNameLabel")}
                      testID={`room-${roomIndex}-table-${tableIndex}-name`}
                    />
                  </View>
                  <Stepper
                    options={SEAT_OPTIONS}
                    value={table.seats}
                    onChange={(seats) =>
                      setRooms(patchTable(rooms, room.key, table.key, { seats: Number(seats) }))
                    }
                    accessibilityLabel={t("admin.onboarding.layout.seatsLabel")}
                    decrementLabel={t("admin.onboarding.layout.fewerSeats")}
                    incrementLabel={t("admin.onboarding.layout.moreSeats")}
                    testID={`room-${roomIndex}-table-${tableIndex}-seats`}
                  />
                  <RowTextButton
                    label={t("admin.onboarding.layout.removeTable")}
                    color={colors.error}
                    icon="trash-outline"
                    onPress={() => setRooms(removeTable(rooms, room.key, table.key))}
                    testID={`room-${roomIndex}-table-${tableIndex}-remove`}
                  />
                </View>
              ))}
            </View>

            <ButtonRow align="start">
              <Button
                variant="secondary"
                size="sm"
                icon="add"
                onPress={() => setRooms(addTable(rooms, room.key))}
                testID={`room-${roomIndex}-add-table`}
              >
                {t("admin.onboarding.layout.addTable")}
              </Button>
            </ButtonRow>
          </View>
        ))}
      </View>

      {noTable ? (
        <ThemedText
          style={[styles.warning, { color: colors.error }]}
          role="status"
          testID="layout-none"
        >
          {t("errors.onboarding.layout_empty")}
        </ThemedText>
      ) : null}

      <ButtonRow align="start">
        <Button
          size="md"
          icon="add"
          onPress={() => setRooms(addRoom(rooms, t("admin.onboarding.layout.defaultRoomName")))}
          testID="layout-add-room"
        >
          {t("admin.onboarding.layout.addRoom")}
        </Button>
      </ButtonRow>
      <ThemedText style={[styles.note, { color: colors.muted }]}>
        {t("admin.onboarding.layout.note")}
      </ThemedText>
    </StepShell>
  );
}
