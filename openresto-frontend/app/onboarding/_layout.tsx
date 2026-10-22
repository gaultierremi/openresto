import { useEffect } from "react";
import { Platform, View } from "react-native";
import { Redirect, Slot, usePathname, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import ErrorScreen from "@/components/common/ErrorScreen";
import PageLoader from "@/components/common/PageLoader";
import {
  OnboardingSessionProvider,
  useOnboardingSession,
} from "@/context/OnboardingSessionContext";
import { useBrand } from "@/context/BrandContext";
import { BrandPaletteScope } from "@/context/BrandPaletteContext";
import { useBrowserLocaleOptOut } from "@/context/LocaleContext";
import { useNoIndex } from "@/hooks/use-noindex";
import { styles } from "@/styles/onboarding/layout.styles";

const LOGIN_PATH = "/onboarding/login";

/** The two screens that are for someone with no session yet: signing in, and accepting an invitation. */
const isPublicPath = (pathname: string) =>
  pathname === LOGIN_PATH || pathname.startsWith("/onboarding/invitation/");

/**
 * The restaurateur's space is a web surface like the admin: the self-hoster's native build ships
 * the guest routes only, so on ios/android this layout hands the visitor back to the home screen.
 *
 * Like the admin it opts out of the browser's language, so a restaurateur reads the instance's
 * own default rather than whatever the browser lists, and it asks search engines to leave every
 * route out: an invitation link is a credential, not a page to be found.
 *
 * @see [onboarding-layout.test.tsx](../../tests/app/onboarding/onboarding-layout.test.tsx) —
 * pins the redirect on native, the opt-out and noindex on web, the redirect to sign-in for
 * anyone without a session (a 401 from anywhere included), and that the two public screens
 * open without one.
 */
export default function OnboardingLayout() {
  if (Platform.OS !== "web") return <Redirect href="/" />;
  return <OnboardingLayoutWeb />;
}

function OnboardingLayoutWeb() {
  useBrowserLocaleOptOut();
  useNoIndex();
  // Like the admin, the restaurateur's space keeps the colour as chosen (BrandPaletteContext).
  return (
    <BrandPaletteScope mode="chosen">
      <OnboardingSessionProvider>
        <OnboardingGate />
      </OnboardingSessionProvider>
    </BrandPaletteScope>
  );
}

function OnboardingGate() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const brand = useBrand();
  const { status, refresh } = useOnboardingSession();
  const isPublic = isPublicPath(pathname);

  useEffect(() => {
    document.title = `${t("admin.onboarding.documentTitle")} | ${brand.appName}`;
  }, [t, brand.appName]);

  const signedOut = status === "unauthenticated" || status === "forbidden";

  useEffect(() => {
    if (signedOut && !isPublic) router.replace(LOGIN_PATH);
  }, [signedOut, isPublic, router]);

  if (isPublic) {
    return (
      <View style={styles.root}>
        <Slot />
      </View>
    );
  }

  if (status === "error") {
    return <ErrorScreen retry={() => void refresh()} />;
  }

  // A signed-out visitor is on their way to sign in; nothing of the screen they asked for shows.
  if (status === "loading" || signedOut) return <PageLoader />;

  return (
    <View style={styles.root}>
      <Slot />
    </View>
  );
}
