import { useEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { ThemedText } from "@/components/themed-text";
import Button from "@/components/common/Button";
import { ButtonRow } from "@/components/common/ButtonRow";
import { MessageCard } from "@/components/onboarding/MessageCard";
import { OnboardingPage } from "@/components/onboarding/OnboardingPage";
import { useOnboardingSession } from "@/context/OnboardingSessionContext";
import { styles } from "./OnboardingHome.styles";

/**
 * Where `/onboarding` resolves: one restaurant goes straight to its assistant, none is an
 * explanation (an invitation is how a restaurant arrives), several is a list to choose from.
 * It waits for the session; the layout has already sent anyone without one to sign in.
 *
 * @see [OnboardingHome.test.tsx](../../tests/components/onboarding/OnboardingHome.test.tsx) —
 * pins the redirect for one restaurant, the empty state for none, and the list for several.
 */
export function OnboardingHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const { me, signOut } = useOnboardingSession();
  const restaurants = me?.restaurants ?? [];
  const only = restaurants.length === 1 ? restaurants[0] : null;

  useEffect(() => {
    if (only)
      router.replace(
        `/onboarding/${only.status === "Draft" ? "restaurant" : "dashboard"}/${only.id}`
      );
  }, [only, router]);

  if (!me || only) {
    return (
      <OnboardingPage centered>
        <ThemedText testID="onboarding-home-loading">
          {t("admin.onboarding.home.loading")}
        </ThemedText>
      </OnboardingPage>
    );
  }

  return (
    <OnboardingPage centered>
      <MessageCard
        icon={restaurants.length === 0 ? "storefront-outline" : "restaurant-outline"}
        title={
          restaurants.length === 0
            ? t("admin.onboarding.home.emptyTitle")
            : t("admin.onboarding.home.chooseTitle")
        }
        body={
          restaurants.length === 0
            ? t("admin.onboarding.home.emptyBody")
            : t("admin.onboarding.home.chooseBody")
        }
        testID="onboarding-home"
      >
        {restaurants.length > 0 ? (
          <View style={styles.list}>
            {restaurants.map((restaurant) => (
              <Button
                key={restaurant.id}
                size="md"
                variant="secondary"
                fullWidth
                onPress={() =>
                  router.push(
                    `/onboarding/${restaurant.status === "Draft" ? "restaurant" : "dashboard"}/${restaurant.id}`
                  )
                }
                testID={`onboarding-home-restaurant-${restaurant.id}`}
              >
                {restaurant.name}
              </Button>
            ))}
          </View>
        ) : null}
        <ButtonRow align="start">
          <Button
            size="md"
            variant="ghost"
            tone="neutral"
            icon="log-out-outline"
            onPress={signOut}
            testID="onboarding-home-sign-out"
          >
            {t("admin.onboarding.common.signOut")}
          </Button>
        </ButtonRow>
      </MessageCard>
    </OnboardingPage>
  );
}
