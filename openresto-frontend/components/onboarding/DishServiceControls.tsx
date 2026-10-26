import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import { ThemedText } from "@/components/themed-text";
import { MenuPhoto } from "@/components/menu/MenuPhoto";
import { setMenuAvailability, uploadMenuPhoto, deleteMenuPhoto } from "@/api/onboarding";
import { AVAILABILITIES, PHOTO_TYPES, PHOTO_MAX_BYTES, type Availability } from "@/constants/menu";
import { pickFile } from "@/utils/pickFile";
import { useOnboardingCall } from "@/hooks/use-onboarding-call";
import { styles } from "./DishServiceControls.styles";

export function DishServiceControls({
  restaurantId,
  itemId,
  imageUrl,
  availability = "Available",
  disabled,
  onExpired,
}: {
  restaurantId: number;
  itemId: number;
  imageUrl?: string | null;
  availability?: Availability;
  disabled: boolean;
  onExpired: () => void;
}) {
  const { t } = useTranslation();
  const [photo, setPhoto] = useState(imageUrl);
  const [status, setStatus] = useState(availability);
  const [fileError, setFileError] = useState<string | null>(null);
  const { run, busy, error } = useOnboardingCall(onExpired);
  const upload = async () => {
    if (disabled || busy) return;
    const file = await pickFile(PHOTO_TYPES.join(","));
    if (!file) return;
    if (!(PHOTO_TYPES as readonly string[]).includes(file.type) || file.size > PHOTO_MAX_BYTES) {
      setFileError(
        t(
          file.size > PHOTO_MAX_BYTES
            ? "errors.menu.item_image_too_large"
            : "errors.media.unsupported_image_type"
        )
      );
      return;
    }
    setFileError(null);
    const saved = await run(() => uploadMenuPhoto(restaurantId, itemId, file));
    if (saved) setPhoto(saved.imageUrl);
  };
  return (
    <View style={styles.controls} testID={`dish-service-${itemId}`}>
      <ThemedText>{t("admin.menus.item.availabilityLabel")}</ThemedText>
      <ButtonRow align="start">
        {AVAILABILITIES.map((value) => (
          <Button
            key={value}
            size="sm"
            variant={status === value ? "primary" : "secondary"}
            disabled={disabled || busy}
            testID={`dish-${itemId}-${value}`}
            onPress={async () => {
              if (disabled || busy) return;
              const saved = await run(() => setMenuAvailability(restaurantId, itemId, value));
              if (saved) setStatus(saved.availability);
            }}
          >
            {t(`common.menu.availability.${value}`)}
          </Button>
        ))}
      </ButtonRow>
      {photo ? <MenuPhoto uri={photo} size={96} /> : null}
      <ButtonRow align="start">
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || busy}
          onPress={upload}
          testID={`dish-${itemId}-photo`}
        >
          {t(photo ? "admin.menus.item.photoReplace" : "admin.menus.item.photoAdd")}
        </Button>
        {photo ? (
          <Button
            size="sm"
            variant="secondary"
            tone="danger"
            disabled={disabled || busy}
            onPress={async () => {
              if (disabled || busy) return;
              const saved = await run(() => deleteMenuPhoto(restaurantId, itemId));
              if (saved) setPhoto(saved.imageUrl);
            }}
          >
            {t("admin.menus.item.photoRemove")}
          </Button>
        ) : null}
      </ButtonRow>
      <ThemedText>{t("admin.menus.item.photoHint")}</ThemedText>
      {error || fileError ? (
        <ThemedText role="alert">{fileError ?? error?.message}</ThemedText>
      ) : null}
    </View>
  );
}
