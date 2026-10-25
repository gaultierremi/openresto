import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import Input from "@/components/common/Input";
import Select from "@/components/common/Select";
import { ThemedText } from "@/components/themed-text";
import { LOCALE_LABELS } from "@/constants/locales";
import { MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH } from "@/constants/menu";
import type { DishLanguage, DishTranslations } from "@/api/menus";
import { styles } from "./DishTranslationFields.styles";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import { suggestMenuText } from "@/utils/menuSuggestions";

const LANGUAGES: DishLanguage[] = ["fr", "nl", "en"];

export function DishTranslationFields({
  primaryLanguage,
  sourceName = "",
  sourceDescription = "",
  translations,
  onChange,
  disabled = false,
  testID = "dish",
}: {
  primaryLanguage: DishLanguage;
  sourceName?: string;
  sourceDescription?: string;
  translations: DishTranslations;
  onChange: (primaryLanguage: DishLanguage, translations: DishTranslations) => void;
  disabled?: boolean;
  testID?: string;
}) {
  const { t } = useTranslation();
  const [proposal, setProposal] = useState<{
    language: DishLanguage;
    source: string;
    name: string;
    description: string;
  } | null>(null);
  const [unavailable, setUnavailable] = useState<DishLanguage | null>(null);
  const source = JSON.stringify([primaryLanguage, sourceName, sourceDescription]);
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
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled || !sourceName.trim()}
              testID={`${testID}-suggest-${language}`}
              onPress={() => {
                if (disabled) return;
                const name = suggestMenuText(sourceName, primaryLanguage, language);
                const description = suggestMenuText(sourceDescription, primaryLanguage, language);
                setUnavailable(
                  !name || (sourceDescription.trim() && !description) ? language : null
                );
                setProposal(
                  name || description
                    ? { language, source, name: name ?? "", description: description ?? "" }
                    : null
                );
              }}
            >
              {t("common.menu.suggestTranslation", { language: LOCALE_LABELS[language] })}
            </Button>
            {unavailable === language ? (
              <ThemedText role="status">{t("common.menu.suggestionUnavailable")}</ThemedText>
            ) : null}
            {proposal?.language === language && proposal.source === source ? (
              <View style={styles.fields} testID={`${testID}-proposal-${language}`}>
                <ThemedText>{t("common.menu.reviewTranslation")}</ThemedText>
                <Input
                  value={proposal.name}
                  editable={!disabled}
                  maxLength={MAX_NAME_LENGTH}
                  accessibilityLabel={nameLabel}
                  testID={`${testID}-proposal-name`}
                  onChangeText={(name) => setProposal({ ...proposal, name })}
                />
                <Input
                  value={proposal.description}
                  editable={!disabled}
                  maxLength={MAX_DESCRIPTION_LENGTH}
                  accessibilityLabel={descriptionLabel}
                  testID={`${testID}-proposal-description`}
                  onChangeText={(description) => setProposal({ ...proposal, description })}
                />
                <ButtonRow align="start">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled}
                    onPress={() => setProposal(null)}
                  >
                    {t("common.actions.cancel")}
                  </Button>
                  <Button
                    size="sm"
                    disabled={
                      disabled ||
                      !proposal.name.trim() ||
                      (!!sourceDescription.trim() && !proposal.description.trim())
                    }
                    testID={`${testID}-validate-${language}`}
                    onPress={() => {
                      if (
                        disabled ||
                        !proposal.name.trim() ||
                        (!!sourceDescription.trim() && !proposal.description.trim())
                      )
                        return;
                      onChange(primaryLanguage, {
                        ...translations,
                        [language]: {
                          name: proposal.name.trim(),
                          description: proposal.description.trim() || null,
                        },
                      });
                      setProposal(null);
                    }}
                  >
                    {t("common.menu.validateTranslation")}
                  </Button>
                </ButtonRow>
              </View>
            ) : null}
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
