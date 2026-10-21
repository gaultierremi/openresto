import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import { RowTextButton } from "@/components/common/RowTextButton";
import { fetchSitePreview } from "@/api/onboarding";
import { useAppTheme } from "@/hooks/use-app-theme";
import type { OnboardingSitePreviewProps } from "./OnboardingSitePreview";
import { PHONE_WIDTH, PREVIEW_HEIGHT, styles } from "./OnboardingSitePreview.styles";

type Frame = "phone" | "desktop";

/**
 * The server's own rendering of the website, in a frame. The frame has an empty `sandbox`: the
 * page carries no script of its own, so nothing is lost, and nothing the preview shows can reach
 * the assistant around it. `srcDoc` rather than a URL because the preview endpoint wants the
 * restaurateur's session, and the platform's own headers forbid framing any address.
 *
 * @see [OnboardingSitePreview.web.test.tsx](../../tests/components/onboarding/OnboardingSitePreview.web.test.tsx)
 * — pins that the HTML lands in a script-less sandboxed frame, that a new version asks again,
 * that the old page stays up while the next loads, and the phone and desktop widths.
 */
export function OnboardingSitePreview({ restaurantId, version }: OnboardingSitePreviewProps) {
  const { t } = useTranslation();
  const { colors, primaryColor } = useAppTheme();
  const [html, setHtml] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [frame, setFrame] = useState<Frame>("phone");

  useEffect(() => {
    let cancelled = false;
    fetchSitePreview(restaurantId).then((result) => {
      if (cancelled) return;
      setFailed(!result.ok);
      if (result.ok) setHtml(result.value);
    });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, version]);

  return (
    <View testID="onboarding-site-preview">
      <View
        style={styles.header}
        accessibilityRole="radiogroup"
        accessibilityLabel={t("admin.onboarding.preview.site.frameTitle")}
      >
        <RowTextButton
          label={t("admin.onboarding.preview.site.phone")}
          color={primaryColor}
          icon="phone-portrait-outline"
          selected={frame === "phone"}
          radio
          onPress={() => setFrame("phone")}
          testID="onboarding-site-preview-phone"
        />
        <RowTextButton
          label={t("admin.onboarding.preview.site.desktop")}
          color={primaryColor}
          icon="desktop-outline"
          selected={frame === "desktop"}
          radio
          onPress={() => setFrame("desktop")}
          testID="onboarding-site-preview-desktop"
        />
      </View>
      {failed ? (
        <ThemedText style={[styles.status, { color: colors.error }]} role="alert">
          {t("admin.onboarding.preview.site.failed")}
        </ThemedText>
      ) : null}
      {html === null && !failed ? (
        <ThemedText style={[styles.status, { color: colors.muted }]}>
          {t("admin.onboarding.preview.site.loading")}
        </ThemedText>
      ) : null}
      {html !== null ? (
        <iframe
          title={t("admin.onboarding.preview.site.frameTitle")}
          srcDoc={html}
          sandbox=""
          data-testid="onboarding-site-preview-frame"
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
      ) : null}
    </View>
  );
}

export default OnboardingSitePreview;
