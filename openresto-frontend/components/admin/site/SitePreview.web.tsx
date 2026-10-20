import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import { RowTextButton } from "@/components/common/RowTextButton";
import { adminFetchSitePreview } from "@/api/site";
import { useAppTheme } from "@/hooks/use-app-theme";
import type { SitePreviewProps } from "./SitePreview";
import { PHONE_WIDTH, PREVIEW_HEIGHT, styles } from "./SitePreview.styles";

type Frame = "phone" | "desktop";

/**
 * The server's own rendering of the page, in a frame. The frame has an empty `sandbox`: the
 * page carries no script of its own, so nothing is lost, and nothing the preview shows can reach
 * the admin around it. `srcDoc` rather than a URL because the preview endpoint wants the admin's
 * session and the admin's own headers forbid framing any address.
 *
 * @see [SitePreview.web.test.tsx](../../../tests/components/admin/site/SitePreview.web.test.tsx)
 * — pins that the HTML lands in a script-less sandboxed frame, that a new theme or version asks
 * again, that the old page stays up while the next loads, and the phone and desktop widths.
 */
export function SitePreview({ restaurantId, theme, version }: SitePreviewProps) {
  const { t } = useTranslation();
  const { colors, primaryColor } = useAppTheme();
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [frame, setFrame] = useState<Frame>("phone");

  useEffect(() => {
    let cancelled = false;
    adminFetchSitePreview(restaurantId, theme).then((result) => {
      if (cancelled) return;
      setFailed(!result.ok);
      if (result.ok) setHtml(result.value);
    });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, theme, version]);

  return (
    <View
      style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.card }]}
      testID="site-preview"
    >
      <View style={styles.header}>
        <ThemedText type="h3">{t("admin.site.preview.title")}</ThemedText>
        <View style={styles.toggle} accessibilityRole="radiogroup">
          <RowTextButton
            label={t("admin.site.preview.phone")}
            color={primaryColor}
            icon="phone-portrait-outline"
            selected={frame === "phone"}
            onPress={() => setFrame("phone")}
            testID="site-preview-phone"
          />
          <RowTextButton
            label={t("admin.site.preview.desktop")}
            color={primaryColor}
            icon="desktop-outline"
            selected={frame === "desktop"}
            onPress={() => setFrame("desktop")}
            testID="site-preview-desktop"
          />
        </View>
      </View>
      {failed && (
        <ThemedText style={{ color: colors.error }} role="alert">
          {t("admin.site.preview.failed")}
        </ThemedText>
      )}
      {html === null && !failed ? (
        <ThemedText style={{ color: colors.muted }}>{t("admin.site.preview.loading")}</ThemedText>
      ) : null}
      {html !== null && (
        <iframe
          title={t("admin.site.preview.frameTitle")}
          srcDoc={html}
          sandbox=""
          data-testid="site-preview-frame"
          style={{
            width: frame === "phone" ? PHONE_WIDTH : "100%",
            maxWidth: "100%",
            height: PREVIEW_HEIGHT,
            alignSelf: "center",
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            backgroundColor: "#fff",
          }}
        />
      )}
    </View>
  );
}

export default SitePreview;
