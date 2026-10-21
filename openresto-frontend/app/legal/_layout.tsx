import { Platform, View } from "react-native";
import { Slot, Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import Navbar from "@/components/layout/Navbar";
import { guestHeader } from "@/components/layout/GuestTabStack";

/**
 * The platform's legal documents, outside `(user)` on purpose: a restaurateur reads them from an
 * invitation and a guest from a footer link, and neither wants the booking tabs around them. The
 * pages are public and indexable (no `useNoIndex`), and they follow the visitor's language for
 * their chrome (no `useBrowserLocaleOptOut`): only the documents themselves are in French.
 *
 * @see [legal-layout.test.tsx](../../tests/app/legal/legal-layout.test.tsx) — pins the navbar on
 * web, the native header off it, and that nothing asks search engines to stay away.
 */
export default function LegalLayout() {
  const { t } = useTranslation();

  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1 }}>
        <Navbar />
        <Slot />
      </View>
    );
  }

  return <Stack screenOptions={{ ...guestHeader(), title: t("common.legal.indexTitle") }} />;
}
