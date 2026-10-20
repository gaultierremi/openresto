import type { OnboardingState } from "@/api/onboarding";

/** What the wizard hands each step. Every write answers with the whole state, which replaces it. */
export interface StepProps {
  restaurantId: number;
  state: OnboardingState;
  /** A suspended restaurant: the forms show what is saved and take no input. */
  readOnly: boolean;
  /** Replaces the state with a write's answer, without leaving the step. */
  onState: (state: OnboardingState) => void;
  /** Moves to the next stage. */
  onAdvance: () => void;
  /** Moves to the previous stage; absent on the first. */
  onBack?: () => void;
  /** A call answered 401. */
  onExpired: () => void;
}
