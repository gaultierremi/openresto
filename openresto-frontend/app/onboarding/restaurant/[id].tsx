import { useLocalSearchParams } from "expo-router";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { OnboardingNotFound } from "@/components/onboarding/OnboardingNotFound";

/** A restaurant id is a positive whole number; anything else is the same "not found" as an unknown one. */
const parseRestaurantId = (value: string | undefined): number | null =>
  value !== undefined && /^[1-9]\d*$/.test(value) ? Number(value) : null;

export default function OnboardingRestaurantRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const restaurantId = parseRestaurantId(id);
  if (restaurantId === null) return <OnboardingNotFound />;
  return <OnboardingWizard restaurantId={restaurantId} />;
}
