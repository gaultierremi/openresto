import { useState } from "react";
import { useTranslation } from "react-i18next";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import { ThemedText } from "@/components/themed-text";
import { getMenuTokens, type OnboardingMenu } from "@/api/onboarding";
import { useBrand } from "@/context/BrandContext";
import { menuPrintHtml, openPrintPreview, qrPrintHtml } from "@/utils/menuPrint";
import { qrBaseUrl } from "@/utils/qrCode";

export function MenuPrintActions({
  restaurantId,
  name,
  menu,
  onExpired,
}: {
  restaurantId: number;
  name: string;
  menu: OnboardingMenu;
  onExpired: () => void;
}) {
  const { t, i18n } = useTranslation();
  const brand = useBrand();
  const [error, setError] = useState<string | null>(null);
  const printQrs = () => {
    const popup = window.open("", "_blank");
    if (!popup) {
      setError(t("common.menu.printBlocked"));
      return;
    }
    popup.opener = null;
    popup.document.body.textContent = t("admin.onboarding.preview.loading");
    getMenuTokens(restaurantId).then((result) => {
      if (!result.ok) {
        popup.close();
        if (result.status === 401) onExpired();
        else setError(result.message);
        return;
      }
      if (popup.closed) return;
      const html = qrPrintHtml(
        name,
        result.value,
        qrBaseUrl(brand.websiteUrl, window.location.origin)
      );
      if (!openPrintPreview(name, html, popup)) setError(t("common.menu.printBlocked"));
    });
  };
  return (
    <>
      <ButtonRow align="start">
        <Button
          size="sm"
          variant="secondary"
          testID="menu-print"
          onPress={() => {
            setError(
              openPrintPreview(name, menuPrintHtml(name, menu, i18n.language))
                ? null
                : t("common.menu.printBlocked")
            );
          }}
        >
          {t("common.menu.printMenu")}
        </Button>
        <Button size="sm" variant="secondary" testID="menu-print-qrs" onPress={printQrs}>
          {t("common.menu.printQrs")}
        </Button>
      </ButtonRow>
      {error ? <ThemedText role="alert">{error}</ThemedText> : null}
    </>
  );
}
