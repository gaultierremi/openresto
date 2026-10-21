import type { StepProps } from "@/types/onboarding";
import { state } from "@/tests/helpers/onboardingFixtures";

/** The props the wizard hands a step, with spies for everything it hands back. */
export const stepProps = (over: Partial<StepProps> = {}): StepProps => ({
  restaurantId: 7,
  state: state(),
  readOnly: false,
  onState: jest.fn(),
  onAdvance: jest.fn(),
  onBack: jest.fn(),
  onExpired: jest.fn(),
  ...over,
});
