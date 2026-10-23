import { View } from "react-native";
import { useTranslation } from "react-i18next";
import Input from "@/components/common/Input";
import Select from "@/components/common/Select";
import { ThemedText } from "@/components/themed-text";
import { LOCALE_LABELS } from "@/constants/locales";
import { MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH } from "@/constants/menu";
import type { DishLanguage, DishTranslations } from "@/api/menus";
import { styles } from "./DishTranslationFields.styles";

const LANGUAGES: DishLanguage[] = ["fr", "nl", "en"];

export function DishTranslationFields({
  primaryLanguage,
  translations,
  onChange,
  disabled = false,
  testID = "dish",
}: {
  primaryLanguage: DishLanguage;
  translations: DishTranslations;
  onChange: (primaryLanguage: DishLanguage, translations: DishTranslations) => void;
  disabled?: boolean;
  testID?: string;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.fields}>
      <ThemedText>{t("common.menu.primaryLanguage")}</ThemedText>
      <View testID={`${testID}-primary-language`}>
        {disabled ? (
          <ThemedText>{LOCALE_LABELS[primaryLanguage]}</ThemedText>
        ) : (
          <Select
            options={LANGUAGES.map((value) => ({ value, label: LOCALE_LABELS[value] }))}
            selectedValue={primaryLanguage}
            onSelect={(value) => onChange(value as DishLanguage, translations)}
            accessibilityLabel={t("common.menu.primaryLanguage")}
          />
        )}
      </View>
      <ThemedText>{t("common.menu.translationHint")}</ThemedText>
      {LANGUAGES.filter((language) => language !== primaryLanguage).map((language) => {
        const patch = (field: "name" | "description", value: string) =>
          onChange(primaryLanguage, {
            ...translations,
            [language]: {
              name: null,
              description: null,
              ...translations[language],
              [field]: value || null,
            },
          });
        const nameLabel = t("common.menu.translatedName", { language: LOCALE_LABELS[language] });
        const descriptionLabel = t("common.menu.translatedDescription", {
          language: LOCALE_LABELS[language],
        });
        return (
          <View key={language} style={styles.fields}>
            <ThemedText>{nameLabel}</ThemedText>
            <Input
              value={translations[language]?.name ?? ""}
              onChangeText={(value) => patch("name", value)}
              editable={!disabled}
              maxLength={MAX_NAME_LENGTH}
              accessibilityLabel={nameLabel}
              testID={`${testID}-translation-${language}-name`}
            />
            <ThemedText>{descriptionLabel}</ThemedText>
            <Input
              value={translations[language]?.description ?? ""}
              onChangeText={(value) => patch("description", value)}
              editable={!disabled}
              multiline
              maxLength={MAX_DESCRIPTION_LENGTH}
              accessibilityLabel={descriptionLabel}
              testID={`${testID}-translation-${language}-description`}
            />
          </View>
        );
      })}
    </View>
  );
}
