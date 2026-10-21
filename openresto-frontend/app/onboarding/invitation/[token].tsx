import { useLocalSearchParams } from "expo-router";
import { InvitationScreen } from "@/components/onboarding/InvitationScreen";

export default function OnboardingInvitationRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <InvitationScreen token={token} />;
}
