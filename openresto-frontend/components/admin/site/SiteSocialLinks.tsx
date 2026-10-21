import { View } from "react-native";
import { useTranslation } from "react-i18next";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import Input from "@/components/common/Input";
import { RowTextButton } from "@/components/common/RowTextButton";
import Select from "@/components/common/Select";
import { useAppTheme } from "@/hooks/use-app-theme";
import { MAX_SOCIAL_URL_LENGTH, SOCIAL_KINDS, type SocialKind } from "@/constants/site";
import { nextFreeKind, type SocialRow } from "@/utils/siteForm";
import { styles } from "./SiteSocialLinks.styles";

const KIND_OPTIONS = SOCIAL_KINDS.map((kind) => ({ label: kind, value: kind }));

/**
 * The footer's social links: one row per network, a network never twice. Rows are edited in
 * place and autosaved with the rest of the form; a row whose address is still empty is simply
 * not sent, so adding one costs nothing until it is filled.
 *
 * @see [SiteSocialLinks.test.tsx](../../../tests/components/admin/site/SiteSocialLinks.test.tsx)
 * — pins that the add button disappears once every network has a row, that a new row starts on
 * a free network, and that editing and removing touch only their own row.
 */
export function SiteSocialLinks({
  rows,
  onChange,
}: {
  rows: SocialRow[];
  onChange: (rows: SocialRow[]) => void;
}) {
  const { t } = useTranslation();
  const { primaryColor } = useAppTheme();
  const free = nextFreeKind(rows);

  const edit = (index: number, change: Partial<SocialRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...change } : row)));

  return (
    <View style={styles.list}>
      {rows.map((row, index) => (
        <View key={index} style={styles.row} testID={`site-social-row-${index}`}>
          <View style={styles.kind}>
            <Select
              options={KIND_OPTIONS}
              selectedValue={row.kind}
              onSelect={(value) => edit(index, { kind: value as SocialKind })}
              accessibilityLabel={t("admin.site.social.kindLabel")}
            />
          </View>
          <View style={styles.url}>
            <Input
              value={row.url}
              onChangeText={(url) => edit(index, { url })}
              placeholder={t("admin.site.social.urlPlaceholder")}
              maxLength={MAX_SOCIAL_URL_LENGTH}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              accessibilityLabel={t("admin.site.social.urlLabel", { network: row.kind })}
              testID={`site-social-url-${index}`}
            />
          </View>
          <RowTextButton
            label={t("admin.site.social.remove")}
            accessibilityLabel={t("admin.site.social.removeNamed", { network: row.kind })}
            color={primaryColor}
            icon="trash-outline"
            onPress={() => onChange(rows.filter((_, i) => i !== index))}
            testID={`site-social-remove-${index}`}
          />
        </View>
      ))}
      {free && (
        <ButtonRow align="start">
          <Button
            size="md"
            icon="add"
            onPress={() => onChange([...rows, { kind: free, url: "" }])}
            testID="site-social-add"
          >
            {t("admin.site.social.add")}
          </Button>
        </ButtonRow>
      )}
    </View>
  );
}
