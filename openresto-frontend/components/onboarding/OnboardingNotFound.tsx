import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import Button from "@/components/common/Button";
import { MessageCard } from "@/components/onboarding/MessageCard";
import { OnboardingPage } from "@/components/onboarding/OnboardingPage";

/**
 * "No such restaurant", worded the same for one that does not exist and one the caller does not
 * run: the server answers both alike, and so does the screen, with no data behind it.
 */
export function OnboardingNotFound() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <OnboardingPage centered>
      <MessageCard
        icon="storefront-outline"
        title={t("admin.onboarding.wizard.notFoundTitle")}
        body={t("admin.onboarding.wizard.notFoundBody")}
        testID="wizard-not-found"
      >
        <Button
          size="md"
          variant="secondary"
          onPress={() => router.replace("/onboarding")}
          testID="wizard-not-found-back"
        >
          {t("admin.onboarding.wizard.notFoundAction")}
        </Button>
      </MessageCard>
    </OnboardingPage>
  );
}
