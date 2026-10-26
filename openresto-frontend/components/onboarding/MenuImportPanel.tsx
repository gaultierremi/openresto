import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import Input from "@/components/common/Input";
import { ThemedText } from "@/components/themed-text";
import { Banner, Field } from "./formParts";
import { importMenuPhoto, importMenuText, type SaveMenuInput } from "@/api/onboarding";
import { useOnboardingCall } from "@/hooks/use-onboarding-call";
import { pickSiteImage, siteImageRefusalMessage } from "@/utils/siteImage";
import { dishPriceText } from "@/utils/onboardingPrice";
import { styles } from "./QuickStart.styles";

export function MenuImportPanel({
  restaurantId,
  readOnly,
  onExpired,
  onAccept,
}: {
  restaurantId: number;
  readOnly: boolean;
  onExpired: () => void;
  onAccept: (menu: SaveMenuInput) => void;
}) {
  const { t, i18n } = useTranslation();
  const [text, setText] = useState("");
  const [language, setLanguage] = useState(
    ["fr", "nl", "en"].includes(i18n.language) ? i18n.language : "fr"
  );
  const [proposal, setProposal] = useState<SaveMenuInput | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const { busy, error, run } = useOnboardingCall(onExpired);
  const generate = async () => {
    setProposal(null);
    setRefusal(null);
    const result = await run(() => importMenuText(restaurantId, text, language));
    if (result) setProposal(result);
  };
  const photo = async () => {
    const picked = await pickSiteImage();
    if (!picked) return;
    setProposal(null);
    if (picked.refusal) {
      setRefusal(siteImageRefusalMessage(picked.refusal, t));
      return;
    }
    setRefusal(null);
    const result = await run(() => importMenuPhoto(restaurantId, picked.file, language));
    if (result) setProposal(result);
  };
  return (
    <View style={styles.panel} testID="menu-import">
      <ThemedText type="h3">{t("admin.onboarding.x3.importTitle")}</ThemedText>
      <ThemedText>{t("admin.onboarding.x3.importHint")}</ThemedText>
      <ThemedText>{t("admin.onboarding.x3.language")}</ThemedText>
      <ButtonRow align="start">
        {["fr", "nl", "en"].map((lang) => (
          <Button
            key={lang}
            variant="secondary"
            size="md"
            disabled={readOnly || busy}
            accessibilityLabel={`${lang.toUpperCase()}${lang === language ? " ✓" : ""}`}
            onPress={() => {
              setLanguage(lang);
              setProposal(null);
            }}
            testID={`import-language-${lang}`}
          >
            {`${lang.toUpperCase()}${lang === language ? " ✓" : ""}`}
          </Button>
        ))}
      </ButtonRow>
      <Field label={t("admin.onboarding.x3.text")}>
        <Input
          value={text}
          onChangeText={(value) => {
            setText(value);
            setProposal(null);
          }}
          multiline
          maxLength={20000}
          editable={!readOnly && !busy}
          accessibilityLabel={t("admin.onboarding.x3.text")}
          testID="import-text"
        />
      </Field>
      <ButtonRow align="start">
        <Button
          variant="secondary"
          size="md"
          disabled={readOnly || busy}
          onPress={photo}
          testID="import-photo"
        >
          {t("admin.onboarding.x3.photo")}
        </Button>
        <Button
          size="md"
          loading={busy}
          disabled={readOnly || !text.trim()}
          onPress={generate}
          testID="import-propose"
        >
          {t("admin.onboarding.x3.propose")}
        </Button>
      </ButtonRow>
      {refusal || error ? <Banner testID="import-error">{refusal ?? error?.message}</Banner> : null}
      {proposal ? (
        <View style={styles.panel} testID="import-proposals">
          <ThemedText>{t("admin.onboarding.x3.review")}</ThemedText>
          {proposal.categories.flatMap((category, c) =>
            category.items.map((item, i) => (
              <ThemedText key={`${c}-${i}`}>
                {item.name} ·{" "}
                {item.priceMinor === null
                  ? t("admin.onboarding.preview.qr.priceOnRequest")
                  : `${dishPriceText(item.priceMinor)} €`}
              </ThemedText>
            ))
          )}
          <ButtonRow>
            <Button size="md" variant="secondary" onPress={() => setProposal(null)}>
              {t("common.actions.cancel")}
            </Button>
            <Button
              size="md"
              disabled={readOnly}
              onPress={() => {
                onAccept(proposal);
                setProposal(null);
                setText("");
              }}
              testID="import-accept"
            >
              {t("admin.onboarding.x3.accept")}
            </Button>
          </ButtonRow>
        </View>
      ) : null}
    </View>
  );
}
