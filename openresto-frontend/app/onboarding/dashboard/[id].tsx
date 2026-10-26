import { useLocalSearchParams } from "expo-router";
import { OperationsDashboard } from "@/components/onboarding/OperationsDashboard";
import { OnboardingNotFound } from "@/components/onboarding/OnboardingNotFound";

export default function OperationsRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return id && /^[1-9]\d*$/.test(id) ? (
    <OperationsDashboard key={id} restaurantId={Number(id)} />
  ) : (
    <OnboardingNotFound />
  );
}
